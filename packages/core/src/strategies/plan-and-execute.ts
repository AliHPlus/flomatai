/**
 * Plan-and-Execute strategy — LLM creates a plan upfront, then executes it.
 *
 * 1. LLM receives goal + skill catalog → produces ordered execution plan
 * 2. Each planned step is executed
 * 3. Optional: re-plan after each step based on actual outputs
 */

import type { Skill } from '../skill.js';
import type { Strategy, AgentContext, AgentResult, AgentTraceEntry } from './types.js';

interface PlanStep {
  step_name: string;
  skill: string;
  input_description: string;
  expected_output: string;
  depends_on: string[];
}

interface Plan {
  reasoning: string;
  steps: PlanStep[];
}

export interface PlanAndExecuteOptions {
  /** Re-plan after each step based on actual output (default: false). */
  replanAfterEachStep?: boolean;
  /** Max number of re-plans allowed (default: 3). */
  maxReplans?: number;
  /** Custom planning prompt override. Receives skill catalog + goal. */
  planPromptTemplate?: string;
}

export class PlanAndExecuteStrategy implements Strategy {
  constructor(private options: PlanAndExecuteOptions = {}) {}

  async execute(
    skills: Skill[],
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const trace: AgentTraceEntry[] = [];
    const startMs = Date.now();
    const results = new Map<string, unknown>();
    let replanCount = 0;
    const maxReplans = this.options.maxReplans ?? 3;

    // ── Phase 1: Plan ──────────────────────────────────────────────────────
    let plan = await this.createPlan(skills, input, results, ctx);
    trace.push({
      type: 'plan',
      content: plan,
      timestamp: new Date().toISOString(),
    });
    ctx.logger.debug(`[plan-and-execute] Plan created: ${plan.steps.length} steps`);

    // ── Phase 2: Execute ───────────────────────────────────────────────────
    const sortedSteps = this.topologicalSort(plan.steps);

    for (const planStep of sortedSteps) {
      if (ctx.abortSignal.aborted) throw new Error(`Agent "${ctx.agentName}" aborted`);

      const skill = skills.find((s) => s.meta.name === planStep.skill);
      if (!skill) {
        ctx.logger.warn(`[plan-and-execute] Skill "${planStep.skill}" not found — skipping`);
        continue;
      }

      // Derive input from previous results
      const stepInput = this.resolveStepInput(planStep, input, results);

      ctx.logger.debug(
        `[plan-and-execute] Executing step "${planStep.step_name}" with skill "${planStep.skill}"`,
      );

      const t0 = Date.now();
      const output = await skill.execute(
        stepInput as Parameters<typeof skill.execute>[0],
        ctx.toSkillContext(),
      );
      const durationMs = Date.now() - t0;

      results.set(planStep.step_name, output);

      trace.push({
        type: 'action',
        skill: planStep.skill,
        input: stepInput,
        output,
        timestamp: new Date().toISOString(),
        content: { step: planStep.step_name, durationMs },
      });

      // Optional re-plan
      if (this.options.replanAfterEachStep && replanCount < maxReplans) {
        const newPlan = await this.replan(skills, input, results, plan, ctx);
        if (JSON.stringify(newPlan.steps) !== JSON.stringify(plan.steps)) {
          plan = newPlan;
          replanCount++;
          trace.push({
            type: 'replan',
            content: { plan, replanCount },
            timestamp: new Date().toISOString(),
          });
          ctx.logger.debug(`[plan-and-execute] Replanned (${replanCount}/${maxReplans})`);
        }
      }
    }

    const finalOutput = results.size === 1
      ? results.values().next().value
      : Object.fromEntries(results);

    trace.push({ type: 'finish', output: finalOutput, timestamp: new Date().toISOString() });

    return {
      output: finalOutput,
      trace,
      tokensUsed: ctx.totalTokens,
      durationMs: Date.now() - startMs,
    };
  }

  private async createPlan(
    skills: Skill[],
    input: unknown,
    existingResults: Map<string, unknown>,
    ctx: AgentContext,
  ): Promise<Plan> {
    const skillCatalog = skills.map((s) => ({
      name: s.meta.name,
      description: s.meta.description,
      tags: s.meta.tags ?? [],
    }));

    const completedStr =
      existingResults.size > 0
        ? `\nALREADY COMPLETED: ${[...existingResults.keys()].join(', ')}`
        : '';

    const prompt =
      this.options.planPromptTemplate ??
      `You are a planning agent. Create an execution plan to achieve the goal.

ROLE: ${ctx.agentRole}

AVAILABLE SKILLS:
${JSON.stringify(skillCatalog, null, 2)}

GOAL INPUT:
${JSON.stringify(input, null, 2).substring(0, 3000)}
${completedStr}

Rules:
- Only include skills that are necessary
- You may use the same skill multiple times with different step_names
- depends_on must reference step_names defined earlier in the plan
- Keep input_description concise — it will be used to build the actual input

Respond with ONLY valid JSON:
{
  "reasoning": "why this plan",
  "steps": [
    {
      "step_name": "unique-step-id",
      "skill": "skill-name",
      "input_description": "what input to pass and where to get it from",
      "expected_output": "what this produces",
      "depends_on": ["step-name"]
    }
  ]
}`;

    const response = await ctx.llm.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, responseFormat: 'json' },
    );
    ctx.addTokens(response.usage.totalTokens);

    try {
      return JSON.parse(response.content) as Plan;
    } catch {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Plan-and-execute failed to produce valid JSON plan`);
      return JSON.parse(match[0]) as Plan;
    }
  }

  private async replan(
    skills: Skill[],
    input: unknown,
    results: Map<string, unknown>,
    currentPlan: Plan,
    ctx: AgentContext,
  ): Promise<Plan> {
    const completedStr = [...results.entries()]
      .map(([k, v]) => `${k}: ${JSON.stringify(v).substring(0, 200)}`)
      .join('\n');

    const prompt = `You are re-planning based on actual results.

ROLE: ${ctx.agentRole}

ORIGINAL GOAL: ${JSON.stringify(input).substring(0, 1000)}

ORIGINAL PLAN:
${JSON.stringify(currentPlan.steps.map((s) => s.step_name), null, 2)}

COMPLETED STEPS AND OUTPUTS:
${completedStr}

AVAILABLE SKILLS:
${skills.map((s) => `${s.meta.name}: ${s.meta.description}`).join('\n')}

Do you need to adjust the remaining plan? Produce a complete updated plan (include completed steps too).
Respond with ONLY valid JSON using the same format as the original plan.`;

    const response = await ctx.llm.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, responseFormat: 'json' },
    );
    ctx.addTokens(response.usage.totalTokens);

    try {
      return JSON.parse(response.content) as Plan;
    } catch {
      return currentPlan; // keep original on parse failure
    }
  }

  private topologicalSort(steps: PlanStep[]): PlanStep[] {
    const nameToStep = new Map(steps.map((s) => [s.step_name, s]));
    const sorted: PlanStep[] = [];
    const visited = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      const step = nameToStep.get(name);
      if (!step) return;
      for (const dep of step.depends_on) {
        visit(dep);
      }
      visited.add(name);
      sorted.push(step);
    };

    for (const step of steps) visit(step.step_name);
    return sorted;
  }

  private resolveStepInput(
    step: PlanStep,
    originalInput: unknown,
    results: Map<string, unknown>,
  ): unknown {
    // If there are dependencies, merge their outputs
    if (step.depends_on.length === 0) return originalInput;
    if (step.depends_on.length === 1) {
      return results.get(step.depends_on[0]!) ?? originalInput;
    }
    // Multiple dependencies: merge all into one object
    const merged: Record<string, unknown> = { _original: originalInput };
    for (const dep of step.depends_on) {
      merged[dep] = results.get(dep);
    }
    return merged;
  }
}
