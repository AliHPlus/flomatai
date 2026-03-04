/**
 * @flomatai/provider-ollama
 *
 * Ollama local model provider for flomatai.
 * Talks to a local Ollama server via its REST API (no SDK needed).
 * Supports any model pulled via `ollama pull <model>`.
 */

import type {
  LLMProvider,
  Message,
  LLMOptions,
  LLMResponse,
  LLMChunk,
} from '@flomatai/core';
import { LLMError } from '@flomatai/core';

// ── Config ────────────────────────────────────────────────────────────────────

export interface OllamaConfig {
  /** Ollama server URL. Default: 'http://localhost:11434' */
  baseUrl?: string;
  /** Model name (e.g. 'llama3', 'mistral', 'deepseek-r1'). */
  model: string;
  /** Default temperature. Default: 0.7 */
  temperature?: number;
  /** Context window size. Default: 4096 */
  numCtx?: number;
  /** Request timeout in ms. Default: 300000 (5 min — local models can be slow) */
  timeout?: number;
}

// ── Ollama API types ──────────────────────────────────────────────────────────

interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  options?: {
    temperature?: number;
    num_ctx?: number;
    stop?: string[];
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;
  private config: Required<OllamaConfig>;

  constructor(config: OllamaConfig) {
    this.config = {
      baseUrl: config.baseUrl ?? (process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'),
      model: config.model,
      temperature: config.temperature ?? 0.7,
      numCtx: config.numCtx ?? 4096,
      timeout: config.timeout ?? 300_000,
    };
    this.model = this.config.model;
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    const body: OllamaChatRequest = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options.temperature ?? this.config.temperature,
        num_ctx: this.config.numCtx,
        stop: options.stop,
        num_predict: options.maxTokens,
      },
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeout);

      const res = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text();
        throw new LLMError('ollama', `HTTP ${res.status}: ${text}`, res.status);
      }

      const data = (await res.json()) as OllamaChatResponse;

      const inputTokens = data.prompt_eval_count ?? 0;
      const outputTokens = data.eval_count ?? 0;

      return {
        content: data.message.content,
        model: data.model,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        stopReason: 'stop',
      };
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError(
        'ollama',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async *stream(messages: Message[], options: LLMOptions = {}): AsyncIterable<LLMChunk> {
    const body: OllamaChatRequest = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      options: {
        temperature: options.temperature ?? this.config.temperature,
        num_ctx: this.config.numCtx,
        stop: options.stop,
        num_predict: options.maxTokens,
      },
    };

    try {
      const res = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        throw new LLMError('ollama', `HTTP ${res.status}`, res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const chunk = JSON.parse(line) as OllamaChatResponse;
            yield { content: chunk.message?.content ?? '', done: chunk.done };
            if (chunk.done) return;
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError('ollama', err instanceof Error ? err.message : String(err));
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an Ollama local model provider.
 *
 * @example
 * ```ts
 * import { ollama } from '@flomatai/provider-ollama';
 *
 * const llm = ollama({ model: 'llama3', baseUrl: 'http://localhost:11434' });
 * ```
 */
export function ollama(config: OllamaConfig): OllamaProvider {
  return new OllamaProvider(config);
}
