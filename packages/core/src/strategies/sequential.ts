/**
 * Sequential strategy — runs all skills in order, passing output → input.
 *
 * The simplest strategy. No LLM calls at the agent level.
 * Equivalent to a pipeline but wrapped in an agent for observability.
 */

import type { Skill } from '../skill.js';
import type { Strategy, AgentContext, AgentResult, AgentTraceEntry } from './types.js';

export class SequentialStrategy implements Strategy {
  async execute(
    skills: Skill[],
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const trace: AgentTraceEntry[] = [];
    const startMs = Date.now();
    let current = input;

    for (const skill of skills) {
      if (ctx.abortSignal.aborted) {
        throw new Error(`Agent "${ctx.agentName}" aborted`);
      }

      const skillCtx = ctx.toSkillContext();
      ctx.logger.debug(`[sequential] Running skill "${skill.meta.name}"`);
      const t0 = Date.now();

      const output = await skill.execute(current as Parameters<typeof skill.execute>[0], skillCtx);

      trace.push({
        type: 'action',
        skill: skill.meta.name,
        input: current,
        output,
        timestamp: new Date().toISOString(),
      });

      ctx.logger.debug(
        `[sequential] Skill "${skill.meta.name}" done in ${Date.now() - t0}ms`,
      );
      current = output;
    }

    trace.push({ type: 'finish', output: current, timestamp: new Date().toISOString() });

    return {
      output: current,
      trace,
      tokensUsed: ctx.totalTokens,
      durationMs: Date.now() - startMs,
    };
  }
}
