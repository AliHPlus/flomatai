/**
 * Skill — the atomic unit of work in flomatai.
 *
 * A Skill is a typed, composable function that can:
 *  - Call an LLM (LLMSkill)
 *  - Transform data (TransformSkill)
 *  - Perform IO (IOSkill)
 *  - Execute Python (PythonSkill via bridge)
 *  - Wrap a sub-pipeline (CompositeSkill)
 */

import type { ZodSchema } from 'zod';
import type { LLMProvider } from './llm-provider.js';
import type { StateStore } from './state/types.js';
import type { Logger } from './logger.js';

// ── Skill Metadata ────────────────────────────────────────────────────────────

export interface SkillMeta {
  /** Unique identifier for this skill. Used in pipeline step names. */
  name: string;
  /** Human-readable description for agent routing and planning prompts. */
  description: string;
  /** Semantic version. */
  version?: string;
  /** Categorization tags (e.g. 'llm', 'transform', 'io'). */
  tags?: string[];
  /**
   * Retry configuration.
   * Defaults to 0 retries (fail immediately).
   */
  retries?: number;
  /**
   * Per-execution timeout in milliseconds.
   * 0 or undefined means no timeout.
   */
  timeout?: number;
  /**
   * Cache configuration. If provided, identical inputs return cached results.
   */
  cache?: {
    /** Time-to-live in seconds. */
    ttl: number;
    /** Function that derives a cache key from the input. */
    key: (input: unknown) => string;
  };
}

// ── Skill Context ─────────────────────────────────────────────────────────────

export interface SkillContext {
  /** The LLM bound to this execution context. */
  llm: LLMProvider;
  /** Child logger scoped to this skill execution. */
  logger: Logger;
  /** State store for caching and cross-step communication. */
  state: StateStore;
  /** Emit a named event (for observability / side effects). */
  emit: (event: string, data: unknown) => void;
  /** Arbitrary config passed from the orchestrator. */
  config: Record<string, unknown>;
  /** Abort signal — check this for graceful cancellation. */
  abortSignal: AbortSignal;
  /** ID of the current run. */
  runId: string;
  /** LLM registry — retrieve a named LLM by key. */
  getLLM: (key: string) => LLMProvider;
}

// ── Skill Interface ───────────────────────────────────────────────────────────

export interface Skill<TInput = unknown, TOutput = unknown> {
  /** Metadata describing this skill. */
  meta: SkillMeta;
  /** Zod schema for validating input at runtime. */
  inputSchema: ZodSchema<TInput>;
  /** Zod schema for validating output at runtime. */
  outputSchema: ZodSchema<TOutput>;
  /**
   * Execute the skill.
   * @param input Validated input data.
   * @param ctx   Execution context (LLM, logger, state, etc.).
   * @returns     Validated output data.
   */
  execute(input: TInput, ctx: SkillContext): Promise<TOutput>;
}

// ── Skill Result (with metadata) ─────────────────────────────────────────────

export interface SkillResult<T = unknown> {
  output: T;
  tokensUsed: number;
  durationMs: number;
  cached: boolean;
}
