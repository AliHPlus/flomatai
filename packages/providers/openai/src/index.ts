/**
 * @flomatai/provider-openai
 *
 * OpenAI GPT provider for flomatai.
 * Supports GPT-4o, o1, o3, and any OpenAI model.
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

export interface OpenAIConfig {
  /** API key. Defaults to OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Default: 'gpt-4o' */
  model?: string;
  /** Default temperature. Default: 0.7 */
  temperature?: number;
  /** Default max tokens. Default: 4096 */
  maxTokens?: number;
  /** Base URL override — use this to point at any OpenAI-compatible API. */
  baseURL?: string;
  /** Request timeout in ms. Default: 120000 */
  timeout?: number;
  /** Organization ID. */
  organization?: string;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private client: OpenAI;
  private config: Required<OpenAIConfig>;

  constructor(config: OpenAIConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env['OPENAI_API_KEY'] ?? '',
      model: config.model ?? 'gpt-4o',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      baseURL: config.baseURL ?? '',
      timeout: config.timeout ?? 120_000,
      organization: config.organization ?? '',
    };
    this.model = this.config.model;
    this.client = new OpenAI({
      apiKey: this.config.apiKey || undefined,
      baseURL: this.config.baseURL || undefined,
      organization: this.config.organization || undefined,
      timeout: this.config.timeout,
    });
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    try {
      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: this.config.model,
        messages: messages.map(toOpenAIMessage),
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stop: options.stop ?? undefined,
      };

      // JSON mode
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
      throw mapOpenAIError(err);
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
      throw mapOpenAIError(err);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an OpenAI provider.
 *
 * @example
 * ```ts
 * import { openai } from '@flomatai/provider-openai';
 *
 * const llm = openai({ model: 'gpt-4o', temperature: 0.2 });
 * ```
 */
export function openai(config: OpenAIConfig = {}): OpenAIProvider {
  return new OpenAIProvider(config);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toOpenAIMessage(msg: Message): OpenAI.Chat.ChatCompletionMessageParam {
  if (msg.role === 'system') return { role: 'system', content: msg.content };
  if (msg.role === 'assistant') return { role: 'assistant', content: msg.content };
  return { role: 'user', content: msg.content };
}

function mapOpenAIError(err: unknown): LLMError {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      const retryAfter = (err.headers as Record<string, string>)?.['retry-after'];
      const retryMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
      return new LLMRateLimitError('openai', retryMs);
    }
    return new LLMError('openai', err.message, err.status);
  }
  return new LLMError(
    'openai',
    err instanceof Error ? err.message : String(err),
  );
}
