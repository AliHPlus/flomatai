/**
 * Custom strategy — user provides their own strategy function.
 * Maximum flexibility.
 */

import type { Skill } from '../skill.js';
import type {
  Strategy,
  AgentContext,
  AgentResult,
  CustomStrategyFn,
} from './types.js';

export class CustomStrategy implements Strategy {
  constructor(private fn: CustomStrategyFn) {}

  async execute(
    skills: Skill[],
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    return this.fn(skills, input, ctx);
  }
}
