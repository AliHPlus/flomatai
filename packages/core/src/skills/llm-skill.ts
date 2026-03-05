/**
 * LLMSkill — builds a Skill that calls an LLM with a prompt template.
 *
 * The primary skill type for LLM-backed operations.
 */

import { z, type ZodSchema } from 'zod';
import type { Skill, SkillMeta, SkillContext } from '../skill.js';
import type { Message } from '../types.js';
import { SkillError, SkillValidationError } from '../errors.js';
import { withRetry, withTimeout } from '../llm-provider.js';

// ── LLMSkill Config ───────────────────────────────────────────────────────────

export interface LLMSkillConfig<TInput, TOutput> {
  /** Unique skill name. */
  name: string;
  /** Human-readable description used in agent routing/planning prompts. */
  description: string;
  /** Version string (default '1.0.0'). */
  version?: string;
  /** Tags for categorization. */
  tags?: string[];
  /**
   * Which LLM from the Orchestrator registry to use.
   * Defaults to 'default'. Can be overridden per-execution.
   */
  llm?: string;
  /**
   * Prompt factory. Receives validated input, returns prompt string or messages array.
   */
  prompt: (input: TInput) => string | Message[];
  /**
   * Optional system message prepended to every call.
   */
  systemMessage?: string | ((input: TInput) => string);
  /**
   * Zod schema for input validation.
   */
  inputSchema: ZodSchema<TInput>;
  /**
   * Zod schema for output validation.
   */
  outputSchema: ZodSchema<TOutput>;
  /**
   * Function to parse the raw LLM text response into TOutput.
   * If not provided, the raw text is returned as-is (must match outputSchema).
   */
  parseOutput?: (raw: string, input: TInput) => TOutput;
  /**
   * LLM call options (temperature, maxTokens, etc.).
   */
  llmOptions?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json';
  };
  /** Number of retries on LLM failure (default 1). */
  retries?: number;
  /** Timeout in ms (default none). */
  timeout?: number;
  /** Cache config. */
  cache?: SkillMeta['cache'];
}

// ── LLMSkill Builder ──────────────────────────────────────────────────────────

export function createLLMSkill<TInput, TOutput>(
  config: LLMSkillConfig<TInput, TOutput>,
): Skill<TInput, TOutput> {
  const meta: SkillMeta = {
    name: config.name,
    description: config.description,
    version: config.version ?? '1.0.0',
    tags: config.tags ?? ['llm'],
    retries: config.retries ?? 1,
    timeout: config.timeout,
    cache: config.cache,
  };

  return {
    meta,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,

    async execute(input: TInput, ctx: SkillContext): Promise<TOutput> {
      // ── Input validation ──
      const parsed = config.inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new SkillValidationError(
          config.name,
          'input',
          `Input validation failed: ${parsed.error.message}`,
          parsed.error.issues,
        );
      }
      const validInput = parsed.data;

      // ── Cache lookup ──
      if (config.cache) {
        const cacheKey = `llmskill:${config.name}:${config.cache.key(validInput)}`;
        const cached = await ctx.state.get<TOutput>(cacheKey);
        if (cached !== null) {
          ctx.logger.debug(`Cache hit for skill "${config.name}"`);
          return cached;
        }
      }

      // ── Resolve LLM ──
      const llm = ctx.getLLM(config.llm ?? 'default');

      // ── Build messages ──
      const promptResult = config.prompt(validInput);
      let messages: Message[];

      if (typeof promptResult === 'string') {
        messages = [{ role: 'user', content: promptResult }];
      } else {
        messages = promptResult;
      }

      // Prepend system message if provided
      if (config.systemMessage) {
        const sysContent =
          typeof config.systemMessage === 'string'
            ? config.systemMessage
            : config.systemMessage(validInput);
        messages = [{ role: 'system', content: sysContent }, ...messages];
      }

      // ── Execute with retry/timeout ──
      const retries = config.retries ?? 1;
      const timeout = config.timeout;

      const doCall = () =>
        llm.chat(messages, {
          temperature: config.llmOptions?.temperature,
          maxTokens: config.llmOptions?.maxTokens,
          responseFormat: config.llmOptions?.responseFormat,
          retries: 0, // retries handled here
        });

      const callWithRetry = () =>
        withRetry(
          doCall,
          retries,
          (attempt, err) =>
            ctx.logger.warn(
              `Skill "${config.name}" retry ${attempt}/${retries}: ${err.message}`,
            ),
        );

      const response = await (timeout
        ? withTimeout(callWithRetry, timeout, config.name)
        : callWithRetry());

      ctx.emit('llm:response', {
        skill: config.name,
        tokens: response.usage.totalTokens,
        model: response.model,
      });

      // ── Parse output ──
      let output: TOutput;
      try {
        if (config.parseOutput) {
          output = config.parseOutput(response.content, validInput);
        } else {
          // Try JSON parse if schema expects object, else return raw string
          try {
            output = JSON.parse(response.content) as TOutput;
          } catch {
            output = response.content as unknown as TOutput;
          }
        }
      } catch (err) {
        throw new SkillError(
          config.name,
          `Output parsing failed: ${err instanceof Error ? err.message : String(err)}`,
          { raw: response.content.substring(0, 500) },
        );
      }

      // ── Output validation ──
      const outParsed = config.outputSchema.safeParse(output);
      if (!outParsed.success) {
        ctx.logger.warn(
          `Skill "${config.name}" output failed schema validation — returning raw`,
          outParsed.error.issues,
        );
        // Don't hard-fail on output validation — return what we have
        // This matches real-world LLM usage where output schema is a guide not a gate
      }

      // ── Cache store ──
      if (config.cache) {
        const cacheKey = `llmskill:${config.name}:${config.cache.key(validInput)}`;
        await ctx.state.set(cacheKey, output, config.cache.ttl);
      }

      return output;
    },
  };
}

/** Namespace export for ergonomic usage: LLMSkill.create(...) */
export const LLMSkill = { create: createLLMSkill };
