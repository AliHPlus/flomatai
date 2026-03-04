/**
 * LLMProvider abstraction — the universal interface for all AI model providers.
 *
 * Implementations live in @flomatai/provider-* packages.
 */

import type { Message, LLMOptions, LLMResponse, LLMChunk } from './types.js';

// ── Core Provider Interface ───────────────────────────────────────────────────

export interface LLMProvider {
  /** Identifier for this provider (e.g. 'anthropic', 'openai', 'ollama'). */
  readonly name: string;
  /** The model being used (e.g. 'claude-3-5-sonnet-20241022'). */
  readonly model: string;
  /**
   * Send a chat completion request and await the full response.
   */
  chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  /**
   * Stream a chat completion. Yields chunks as they arrive.
   */
  stream(messages: Message[], options?: LLMOptions): AsyncIterable<LLMChunk>;
}

// ── LLM Registry ─────────────────────────────────────────────────────────────

/**
 * A named registry of LLM providers.
 * The 'default' key is used when no specific provider is requested.
 */
export type LLMRegistry = Record<string, LLMProvider>;

export function resolveLLM(registry: LLMRegistry, key?: string): LLMProvider {
  const resolved = key
    ? (registry[key] ?? registry['default'])
    : registry['default'];

  if (!resolved) {
    throw new Error(
      `LLM provider "${key ?? 'default'}" not found in registry. ` +
      `Available: ${Object.keys(registry).join(', ')}`,
    );
  }
  return resolved;
}

// ── Utility: retry wrapper for LLM calls ─────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  onRetry?: (attempt: number, error: Error) => void,
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt <= retries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms, ...
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 10_000);
        onRetry?.(attempt, lastError);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Utility: timeout wrapper ──────────────────────────────────────────────────

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`"${label}" timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    fn()
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}
