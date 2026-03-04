/**
 * TransformSkill — a pure data transformation skill (no LLM).
 *
 * Replaces n8n Code nodes.
 */

import type { ZodSchema } from 'zod';
import type { Skill, SkillMeta, SkillContext } from '../skill.js';
import { SkillValidationError } from '../errors.js';

export interface TransformSkillConfig<TInput, TOutput> {
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  /**
   * The transformation function. Pure sync or async.
   * The second argument (ctx) is optional — most transforms won't need it.
   */
  transform: (input: TInput, ctx?: SkillContext) => TOutput | Promise<TOutput>;
  timeout?: number;
}

export function createTransformSkill<TInput, TOutput>(
  config: TransformSkillConfig<TInput, TOutput>,
): Skill<TInput, TOutput> {
  const meta: SkillMeta = {
    name: config.name,
    description: config.description,
    version: config.version ?? '1.0.0',
    tags: config.tags ?? ['transform'],
    timeout: config.timeout,
  };

  return {
    meta,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,

    async execute(input: TInput, ctx: SkillContext): Promise<TOutput> {
      // Input validation
      const parsed = config.inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new SkillValidationError(
          config.name,
          'input',
          `Input validation failed: ${parsed.error.message}`,
          parsed.error.issues,
        );
      }

      const output = await config.transform(parsed.data, ctx);
      return output;
    },
  };
}

/** Namespace export: TransformSkill.create(...) */
export const TransformSkill = { create: createTransformSkill };
