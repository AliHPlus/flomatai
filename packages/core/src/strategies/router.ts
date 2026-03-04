/**
 * Router strategy — LLM picks ONE skill to handle the input.
 *
 * Useful for triage/classification: incoming request → route to specialist.
 */

import type { Skill } from '../skill.js';
import type { Strategy, AgentContext, AgentResult, AgentTraceEntry } from './types.js';

interface RouterDecision {
  skill_index: number;
  reasoning: string;
}

export class RouterStrategy implements Strategy {
  async execute(
    skills: Skill[],
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const trace: AgentTraceEntry[] = [];
    const startMs = Date.now();

    // Build skill catalog
    const skillList = skills
      .map((s, i) => `${i}: ${s.meta.name} — ${s.meta.description}`)
      .join('\n');

    const routingPrompt = `You are a routing agent. Pick the BEST single skill to handle the input.

ROLE: ${ctx.agentRole}

AVAILABLE SKILLS:
${skillList}

INPUT:
${JSON.stringify(input, null, 2).substring(0, 3000)}

Respond with ONLY valid JSON — no markdown, no explanation:
{ "skill_index": <number 0-${skills.length - 1}>, "reasoning": "<brief explanation>" }`;

    ctx.logger.debug(`[router] Routing to best skill among ${skills.length} options`);

    const response = await ctx.llm.chat(
      [{ role: 'user', content: routingPrompt }],
      { temperature: 0.1, responseFormat: 'json' },
    );

    ctx.addTokens(response.usage.totalTokens);

    let decision: RouterDecision;
    try {
      decision = JSON.parse(response.content) as RouterDecision;
    } catch {
      // Fallback: find JSON in response
      const match = response.content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(`Router failed to produce valid JSON. Got: ${response.content.substring(0, 200)}`);
      }
      decision = JSON.parse(match[0]) as RouterDecision;
    }

    const chosenSkill = skills[decision.skill_index];
    if (!chosenSkill) {
      throw new Error(
        `Router chose invalid skill index ${decision.skill_index}. Available: 0-${skills.length - 1}`,
      );
    }

    trace.push({
      type: 'route',
      content: {
        chosen: chosenSkill.meta.name,
        index: decision.skill_index,
        reasoning: decision.reasoning,
      },
      timestamp: new Date().toISOString(),
    });

    ctx.logger.debug(`[router] Chose "${chosenSkill.meta.name}": ${decision.reasoning}`);

    const output = await chosenSkill.execute(
      input as Parameters<typeof chosenSkill.execute>[0],
      ctx.toSkillContext(),
    );

    trace.push({
      type: 'finish',
      skill: chosenSkill.meta.name,
      output,
      timestamp: new Date().toISOString(),
    });

    return {
      output,
      trace,
      tokensUsed: ctx.totalTokens,
      durationMs: Date.now() - startMs,
    };
  }
}
