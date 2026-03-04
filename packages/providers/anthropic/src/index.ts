/**
 * @flomatai/provider-anthropic
 *
 * Anthropic Claude provider for flomatai.
 * Supports all Claude models via the official Anthropic SDK.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  Message,
  LLMOptions,
  LLMResponse,
  LLMChunk,
} from '@flomatai/core';
import { LLMError, LLMRateLimitError } from '@flomatai/core';

// ── Config ────────────────────────────────────────────────────────────────────

export interface AnthropicConfig {
  /** API key. Defaults to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Default: 'claude-3-5-sonnet-20241022' */
  model?: string;
  /** Default temperature (0-1). Default: 0.7 */
  temperature?: number;
  /** Default max tokens. Default: 8192 */
  maxTokens?: number;
  /** Base URL override (for proxies). */
  baseURL?: string;
  /** Request timeout in ms. Default: 120000 (2 min) */
  timeout?: number;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private client: Anthropic;
  private config: Required<AnthropicConfig>;

  constructor(config: AnthropicConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '',
      model: config.model ?? 'claude-3-5-sonnet-20241022',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 8192,
      baseURL: config.baseURL ?? '',
      timeout: config.timeout ?? 120_000,
    };
    this.model = this.config.model;
    this.client = new Anthropic({
      apiKey: this.config.apiKey || undefined,
      baseURL: this.config.baseURL || undefined,
      timeout: this.config.timeout,
    });
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { systemMessage, userMessages } = separateSystem(messages);

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        system: systemMessage || undefined,
        messages: userMessages.map(toAnthropicMessage),
      });

      const content = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        stopReason: response.stop_reason ?? 'stop',
      };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }

  async *stream(messages: Message[], options: LLMOptions = {}): AsyncIterable<LLMChunk> {
    const { systemMessage, userMessages } = separateSystem(messages);

    try {
      const stream = this.client.messages.stream({
        model: this.config.model,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        system: systemMessage || undefined,
        messages: userMessages.map(toAnthropicMessage),
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { content: event.delta.text, done: false };
        }
      }
      yield { content: '', done: true };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an Anthropic Claude provider.
 *
 * @example
 * ```ts
 * import { anthropic } from '@flomatai/provider-anthropic';
 *
 * const llm = anthropic({ model: 'claude-3-5-sonnet-20241022', temperature: 0.2 });
 * ```
 */
export function anthropic(config: AnthropicConfig = {}): AnthropicProvider {
  return new AnthropicProvider(config);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function separateSystem(messages: Message[]): {
  systemMessage: string;
  userMessages: Message[];
} {
  const systemParts: string[] = [];
  const userMessages: Message[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      userMessages.push(msg);
    }
  }

  return {
    systemMessage: systemParts.join('\n\n'),
    userMessages,
  };
}

function toAnthropicMessage(msg: Message): Anthropic.MessageParam {
  return {
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content,
  };
}

function mapAnthropicError(err: unknown): LLMError {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429) {
      const retryAfter = err.headers?.['retry-after'];
      const retryMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
      return new LLMRateLimitError('anthropic', retryMs);
    }
    return new LLMError('anthropic', err.message, err.status);
  }
  return new LLMError(
    'anthropic',
    err instanceof Error ? err.message : String(err),
  );
}
