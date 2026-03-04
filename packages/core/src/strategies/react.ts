/**
 * ReAct strategy — iterative Reasoning + Acting loop.
 *
 * Each iteration:
 *   1. THINK — LLM reasons about what to do next
 *   2. ACT   — execute the chosen skill
 *   3. OBSERVE — feed output back to LLM
 *   4. Repeat until LLM decides to FINISH
 */

import type { Skill } from '../skill.js';
import type {
  Strategy,
  AgentContext,
  AgentResult,
  AgentTraceEntry,
} from './types.js';
import { AgentMaxIterationsError } from '../errors.js';

interface ThoughtAction {
  thought: string;
  action:
    | { type: 'use_skill'; skill: string; input: unknown }
    | { type: 'finish'; output: unknown };
}

export interface ReActOptions {
  /** Maximum reasoning iterations before hard stop (default: 10). */
  maxIterations?: number;
  /** Reflect and self-correct every N steps (0 = disabled, default: 0). */
  reflectionInterval?: number;
  /** Custom system prompt additions. */
  systemPromptSuffix?: string;
}

export class ReActStrategy implements Strategy {
  constructor(private options: ReActOptions = {}) {}

  async execute(
    skills: Skill[],
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const trace: AgentTraceEntry[] = [];
    const startMs = Date.now();
    const maxIter = this.options.maxIterations ?? 10;
    const reflectionInterval = this.options.reflectionInterval ?? 0;

    const history: Array<{ thought: string; action: unknown; observation: unknown }> = [];
    const skillMap = new Map(skills.map((s) => [s.meta.name, s]));

    for (let i = 0; i < maxIter; i++) {
      if (ctx.abortSignal.aborted) throw new Error(`Agent "${ctx.agentName}" aborted`);

      // ── Periodic reflection ────────────────────────────────────────────
      if (reflectionInterval > 0 && i > 0 && i % reflectionInterval === 0) {
        const reflection = await this.reflect(history, ctx);
        trace.push({
          type: 'reflection',
          content: reflection,
          iteration: i,
          timestamp: new Date().toISOString(),
        });
        ctx.logger.debug(`[react] Reflection at step ${i}: ${reflection.substring(0, 100)}`);
      }

      // ── Think ─────────────────────────────────────────────────────────
      const thought = await this.think(skills, input, history, ctx, i);

      trace.push({
        type: 'thought',
        iteration: i,
        content: thought.thought,
        timestamp: new Date().toISOString(),
      });

      ctx.logger.debug(`[react:${i}] Thought: ${thought.thought.substring(0, 100)}`);

      // ── Check for finish ──────────────────────────────────────────────
      if (thought.action.type === 'finish') {
        trace.push({
          type: 'finish',
          output: thought.action.output,
          iteration: i,
          timestamp: new Date().toISOString(),
        });
        return {
          output: thought.action.output,
          trace,
          tokensUsed: ctx.totalTokens,
          durationMs: Date.now() - startMs,
        };
      }

      // ── Act ───────────────────────────────────────────────────────────
      const skillName = thought.action.skill;
      const skill = skillMap.get(skillName);

      let observation: unknown;

      if (!skill) {
        observation = {
          error: `Skill "${skillName}" not found. Available: ${[...skillMap.keys()].join(', ')}`,
        };
        ctx.logger.warn(`[react:${i}] Unknown skill "${skillName}"`);
      } else {
        try {
          ctx.logger.debug(`[react:${i}] Calling skill "${skillName}"`);
          observation = await skill.execute(
            thought.action.input as Parameters<typeof skill.execute>[0],
            ctx.toSkillContext(),
          );
          trace.push({
            type: 'action',
            skill: skillName,
            input: thought.action.input,
            output: observation,
            iteration: i,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          observation = {
            error: err instanceof Error ? err.message : String(err),
          };
          ctx.logger.warn(`[react:${i}] Skill "${skillName}" error: ${observation}`);
        }
      }

      trace.push({
        type: 'observation',
        content: observation,
        iteration: i,
        timestamp: new Date().toISOString(),
      });

      history.push({
        thought: thought.thought,
        action: thought.action,
        observation,
      });
    }

    throw new AgentMaxIterationsError(ctx.agentName, maxIter);
  }

  private async think(
    skills: Skill[],
    originalInput: unknown,
    history: Array<{ thought: string; action: unknown; observation: unknown }>,
    ctx: AgentContext,
    iteration: number,
  ): Promise<ThoughtAction> {
    const skillList = skills
      .map((s) => `- ${s.meta.name}: ${s.meta.description}`)
      .join('\n');

    const historyText =
      history.length === 0
        ? 'No previous steps.'
        : history
            .map(
              (h, i) =>
                `[Step ${i + 1}]\nThought: ${h.thought}\nAction: ${JSON.stringify(h.action)}\nObservation: ${JSON.stringify(h.observation).substring(0, 800)}`,
            )
            .join('\n\n');

    const systemPrompt = `${ctx.agentRole}
${this.options.systemPromptSuffix ?? ''}

You operate in a Thought → Action → Observation loop.
After each action you will see the result (observation) and decide what to do next.
When you have enough information, use { "type": "finish", "output": {...} } to stop.`;

    const userPrompt = `AVAILABLE SKILLS:
${skillList}

ORIGINAL INPUT:
${JSON.stringify(originalInput, null, 2).substring(0, 2000)}

HISTORY (${history.length} steps so far):
${historyText}

Step ${iteration + 1}: What do you do next?

Respond with ONLY valid JSON:
{
  "thought": "your step-by-step reasoning",
  "action": { "type": "use_skill", "skill": "skill-name", "input": {...} }
}

OR to finish:
{
  "thought": "why I'm done",
  "action": { "type": "finish", "output": {...} }
}`;

    const response = await ctx.llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.2 },
    );
    ctx.addTokens(response.usage.totalTokens);

    try {
      return JSON.parse(response.content) as ThoughtAction;
    } catch {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(
          `ReAct: LLM did not produce valid JSON at step ${iteration}. Got: ${response.content.substring(0, 300)}`,
        );
      }
      return JSON.parse(match[0]) as ThoughtAction;
    }
  }

  private async reflect(
    history: Array<{ thought: string; action: unknown; observation: unknown }>,
    ctx: AgentContext,
  ): Promise<string> {
    const summary = history
      .map((h, i) => `Step ${i + 1}: ${h.thought.substring(0, 80)} → ${JSON.stringify(h.action).substring(0, 80)}`)
      .join('\n');

    const response = await ctx.llm.chat(
      [
        {
          role: 'user',
          content: `Review your progress:\n${summary}\n\nAre you on track? Stuck in a loop? Should you change approach? Be brief.`,
        },
      ],
      { temperature: 0.1 },
    );
    ctx.addTokens(response.usage.totalTokens);
    return response.content;
  }
}
