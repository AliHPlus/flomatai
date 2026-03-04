/**
 * @flomatai/provider-openai-compat
 *
 * Generic OpenAI-compatible provider for flomatai.
 *
 * Works with any API that follows the OpenAI chat completions spec:
 * - OpenCode (local Claude Code CLI)
 * - GitHub Copilot API
 * - Groq
 * - Together AI
 * - Fireworks AI
 * - AWS Bedrock (with OpenAI compat layer)
 * - Azure OpenAI
 * - Any self-hosted vLLM / LiteLLM proxy
 * - OpenRouter
 */

import OpenAI from 'openai';
import type {
  LLMProvider,
  Message,
  LLMOptions,
  LLMResponse,
  LLMChunk,
} from '@flomatai/core';
import { LLMError, LLMRateLimitError } from '@flomatai/core';

// ── Config ────────────────────────────────────────────────────────────────────

export interface OpenAICompatConfig {
  /**
   * The base URL of the OpenAI-compatible API.
   * @example 'http://localhost:4000/v1'  // LiteLLM proxy
   * @example 'https://api.openrouter.ai/api/v1'  // OpenRouter
   * @example 'https://api.groq.com/openai/v1'  // Groq
   */
  baseUrl: string;
  /** API key (if required by the provider). */
  apiKey?: string;
  /** Model identifier. */
  model: string;
  /** Provider display name (shown in logs and errors). */
  providerName?: string;
  /** Default temperature. Default: 0.7 */
  temperature?: number;
  /** Default max tokens. Default: 4096 */
  maxTokens?: number;
  /** Additional headers (e.g. 'HTTP-Referer' for OpenRouter). */
  headers?: Record<string, string>;
  /** Timeout in ms. Default: 120000 */
  timeout?: number;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OpenAICompatProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private client: OpenAI;
  private config: Required<OpenAICompatConfig>;

  constructor(config: OpenAICompatConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ?? process.env['OPENAI_COMPAT_API_KEY'] ?? 'none',
      model: config.model,
      providerName: config.providerName ?? 'openai-compat',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      headers: config.headers ?? {},
      timeout: config.timeout ?? 120_000,
    };
    this.name = this.config.providerName;
    this.model = this.config.model;

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      defaultHeaders: this.config.headers,
    });
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    try {
      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: this.config.model,
        messages: messages.map(toOpenAIMessage),
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stop: options.stop,
      };

      if (options.responseFormat === 'json') {
        params.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(params);
      const choice = response.choices[0];
      const content = choice?.message.content ?? '';

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        stopReason: choice?.finish_reason ?? 'stop',
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async *stream(messages: Message[], options: LLMOptions = {}): AsyncIterable<LLMChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages.map(toOpenAIMessage),
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta.content ?? '';
        if (delta) yield { content: delta, done: false };
      }
      yield { content: '', done: true };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): LLMError {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) {
        const retryAfter = (err.headers as Record<string, string>)?.['retry-after'];
        return new LLMRateLimitError(
          this.name,
          retryAfter ? parseInt(retryAfter) * 1000 : undefined,
        );
      }
      return new LLMError(this.name, err.message, err.status);
    }
    return new LLMError(this.name, err instanceof Error ? err.message : String(err));
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a generic OpenAI-compatible provider.
 *
 * @example OpenCode:
 * ```ts
 * const llm = openaiCompat({
 *   baseUrl: 'http://localhost:4000/v1',
 *   model: 'anthropic/claude-sonnet-4-6',
 *   providerName: 'opencode',
 * });
 * ```
 *
 * @example OpenRouter:
 * ```ts
 * const llm = openaiCompat({
 *   baseUrl: 'https://openrouter.ai/api/v1',
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   model: 'anthropic/claude-3.5-sonnet',
 *   providerName: 'openrouter',
 *   headers: { 'HTTP-Referer': 'https://yourapp.com' },
 * });
 * ```
 *
 * @example Groq:
 * ```ts
 * const llm = openaiCompat({
 *   baseUrl: 'https://api.groq.com/openai/v1',
 *   apiKey: process.env.GROQ_API_KEY,
 *   model: 'llama-3.1-70b-versatile',
 *   providerName: 'groq',
 * });
 * ```
 */
export function openaiCompat(config: OpenAICompatConfig): OpenAICompatProvider {
  return new OpenAICompatProvider(config);
}

// ── Pre-configured factory shortcuts ─────────────────────────────────────────

/** OpenRouter provider factory. */
export function openRouter(config: {
  apiKey?: string;
  model: string;
  siteUrl?: string;
  siteName?: string;
  temperature?: number;
  maxTokens?: number;
}): OpenAICompatProvider {
  return new OpenAICompatProvider({
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey ?? process.env['OPENROUTER_API_KEY'],
    model: config.model,
    providerName: 'openrouter',
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    headers: {
      'HTTP-Referer': config.siteUrl ?? 'https://flomatai.dev',
      'X-Title': config.siteName ?? 'flomatai',
    },
  });
}

/** Groq provider factory. */
export function groq(config: {
  apiKey?: string;
  model?: string;
  temperature?: number;
}): OpenAICompatProvider {
  return new OpenAICompatProvider({
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: config.apiKey ?? process.env['GROQ_API_KEY'],
    model: config.model ?? 'llama-3.1-70b-versatile',
    providerName: 'groq',
    temperature: config.temperature,
  });
}

/** OpenCode (local Claude Code CLI) provider factory. */
export function openCode(config: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): OpenAICompatProvider {
  return new OpenAICompatProvider({
    baseUrl: config.baseUrl ?? process.env['OPENCODE_BASE_URL'] ?? 'http://localhost:4000/v1',
    apiKey: config.apiKey ?? process.env['OPENCODE_API_KEY'] ?? 'opencode',
    model: config.model ?? 'anthropic/claude-sonnet-4-6',
    providerName: 'opencode',
    timeout: 600_000, // 10 min — OpenCode can be slow
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toOpenAIMessage(msg: Message): OpenAI.Chat.ChatCompletionMessageParam {
  if (msg.role === 'system') return { role: 'system', content: msg.content };
  if (msg.role === 'assistant') return { role: 'assistant', content: msg.content };
  return { role: 'user', content: msg.content };
}
