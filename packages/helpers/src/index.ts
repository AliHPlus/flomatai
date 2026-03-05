/**
 * @flomatai/helpers — shared utilities for flomatai examples.
 *
 * Provides the LLM resolution logic that every example needs but
 * that cannot live in @flomatai/core (which is provider-agnostic).
 *
 * All examples add this package as a dependency instead of copy-pasting
 * the OpenCode / Anthropic backend-selection logic.
 */

import type { LLMProvider } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { openCode } from '@flomatai/provider-openai-compat';

// ── LLM resolution ─────────────────────────────────────────────────────────────

export interface LLMFromEnvOptions {
  /**
   * Default temperature when using the Anthropic provider directly.
   * Has no effect with OpenCode (the local proxy controls sampling).
   */
  temperature?: number;
  /**
   * Default maxTokens when using the Anthropic provider directly.
   * Has no effect with OpenCode.
   */
  maxTokens?: number;
  /**
   * Model override. If not set, falls back to the LLM_MODEL env var, then
   * the provider's own default ('anthropic/claude-sonnet-4-6' for OpenCode,
   * 'claude-3-5-sonnet-20241022' for Anthropic).
   */
  model?: string;
}

/**
 * Resolve the standard flomatai LLM from environment variables.
 *
 * Resolution order:
 *   OPENCODE_BASE_URL or USE_OPENCODE set → OpenCode local proxy
 *   otherwise                             → Anthropic direct API
 *
 * The LLM_MODEL env var overrides the model in both cases.
 * ANTHROPIC_API_KEY is read automatically by the Anthropic provider.
 *
 * This eliminates the 7-line copy-pasted block in every example orchestrator:
 *
 *   // Before (in every orchestrator.ts):
 *   const useOpenCode = process.env['OPENCODE_BASE_URL'] || process.env['USE_OPENCODE'];
 *   const llm = useOpenCode
 *     ? openCode({ model: process.env['LLM_MODEL'] ?? 'anthropic/claude-sonnet-4-6' })
 *     : anthropic({ model: process.env['LLM_MODEL'] ?? 'claude-3-5-sonnet-20241022',
 *                   temperature: 0.2, maxTokens: 8192 });
 *
 *   // After:
 *   import { resolveLLMFromEnv } from '@flomatai/helpers';
 *   const llm = resolveLLMFromEnv({ temperature: 0.2, maxTokens: 8192 });
 *
 * @example
 * ```ts
 * import { Orchestrator, MemoryStore, createConsoleHooks } from '@flomatai/core';
 * import { resolveLLMFromEnv } from '@flomatai/helpers';
 *
 * export const orchestrator = new Orchestrator({
 *   llm: { default: resolveLLMFromEnv({ temperature: 0.2, maxTokens: 8192 }) },
 *   state: new MemoryStore(),
 *   hooks: createConsoleHooks('my-pipeline'),
 * });
 * ```
 */
export function resolveLLMFromEnv(options: LLMFromEnvOptions = {}): LLMProvider {
  const useOpenCode = process.env['OPENCODE_BASE_URL'] || process.env['USE_OPENCODE'];
  const model = options.model ?? process.env['LLM_MODEL'];

  if (useOpenCode) {
    return openCode({
      model: model ?? 'anthropic/claude-sonnet-4-6',
    });
  }

  return anthropic({
    model: model ?? 'claude-3-5-sonnet-20241022',
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });
}
