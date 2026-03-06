/**
 * @flomatai/provider-opencode-server
 *
 * LLMProvider that wraps the `opencode serve` session-based HTTP API.
 *
 * opencode serve exposes a session API — NOT an OpenAI-compatible
 * /v1/chat/completions endpoint. This provider bridges that gap by:
 *
 *   1. Creating a fresh session per chat() call (stateless semantics)
 *   2. Sending the full message history as a single text part
 *   3. Extracting the assistant's text response from the parts array
 *   4. Mapping token usage from the AssistantMessage to LLMResponse
 *
 * Usage:
 *   ```ts
 *   import { openCodeServer } from '@flomatai/provider-opencode-server';
 *
 *   const llm = openCodeServer({
 *     baseUrl: 'http://localhost:4096',
 *     modelID: 'claude-sonnet-4-6',
 *     providerID: 'anthropic',
 *   });
 *   ```
 *
 * Environment variables (all optional):
 *   OPENCODE_SERVER_URL       base URL of the opencode server (default: http://localhost:4096)
 *   OPENCODE_SERVER_PASSWORD  HTTP basic auth password (username: opencode)
 *   OPENCODE_SERVER_USERNAME  HTTP basic auth username (default: opencode)
 *   LLM_MODEL                 model ID override
 */

import type {
  LLMProvider,
  Message,
  LLMOptions,
  LLMResponse,
  LLMChunk,
} from '@flomatai/core';
import { LLMError, LLMRateLimitError } from '@flomatai/core';

// ── Config ────────────────────────────────────────────────────────────────────

export interface OpenCodeServerConfig {
  /**
   * Base URL of the running opencode server.
   * Start with: opencode serve --port 4096
   * @default process.env.OPENCODE_SERVER_URL ?? 'http://localhost:4096'
   */
  baseUrl?: string;

  /**
   * HTTP basic auth password (set via OPENCODE_SERVER_PASSWORD when starting the server).
   * @default process.env.OPENCODE_SERVER_PASSWORD
   */
  password?: string;

  /**
   * HTTP basic auth username.
   * @default process.env.OPENCODE_SERVER_USERNAME ?? 'opencode'
   */
  username?: string;

  /**
   * opencode provider ID. Must be a provider connected in the opencode server.
   * Run GET /provider to list available providers.
   * @default 'anthropic'
   */
  providerID?: string;

  /**
   * Model ID within the provider. Must be a model available under that provider.
   * @default 'claude-sonnet-4-6'
   */
  modelID?: string;

  /**
   * Request timeout in ms. OpenCode can be slow on long completions.
   * @default 900_000 (15 minutes)
   */
  timeout?: number;

  /**
   * Number of retries for transient network errors.
   * @default 3
   */
  retries?: number;

  /**
   * Base delay for exponential backoff retry (ms).
   * @default 1000
   */
  retryDelay?: number;
}

// ── Internal API types ────────────────────────────────────────────────────────

interface OCSSession {
  id: string;
}

interface OCSTextPart {
  type: 'text';
  text: string;
}

interface OCSPart {
  type: string;
  text?: string;
}

interface OCSTokens {
  input: number;
  output: number;
  total?: number;
  reasoning?: number;
}

interface OCSAssistantMessage {
  id: string;
  modelID: string;
  providerID: string;
  tokens: OCSTokens;
  finish?: string;
  error?: {
    name?: string;
    message?: string;
    data?: unknown;
  };
}

interface OCSMessageResponse {
  info: OCSAssistantMessage;
  parts: OCSPart[];
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class OpenCodeServerProvider implements LLMProvider {
  readonly name = 'opencode-server';
  readonly model: string;

  private readonly baseUrl: string;
  private readonly providerID: string;
  private readonly modelID: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly authHeader: string | undefined;

  constructor(config: OpenCodeServerConfig = {}) {
    this.baseUrl = (
      config.baseUrl ??
      process.env['OPENCODE_SERVER_URL'] ??
      'http://localhost:4096'
    ).replace(/\/$/, '');

    this.providerID = config.providerID ?? 'anthropic';
    this.modelID = config.modelID ?? process.env['LLM_MODEL'] ?? 'claude-sonnet-4-6';
    this.model = `${this.providerID}/${this.modelID}`;
    this.timeout = config.timeout ?? 900_000; // 15 min default
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;

    // HTTP basic auth
    const password =
      config.password ?? process.env['OPENCODE_SERVER_PASSWORD'];
    if (password) {
      const username =
        config.username ?? process.env['OPENCODE_SERVER_USERNAME'] ?? 'opencode';
      this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    // 1. Create a fresh session for this call
    const sessionID = await this.createSession();

    try {
      // 2. Build request body
      const body = this.buildMessageBody(messages, options);

      // 3. Send message and await response
      const response = await this.sendMessage(sessionID, body);

      // 4. Extract text content from parts
      const content = response.parts
        .filter((p): p is OCSPart & { type: 'text'; text: string } =>
          p.type === 'text' && typeof p.text === 'string',
        )
        .map((p) => p.text)
        .join('');

      // 5. Check for error in the assistant message
      if (response.info.error) {
        const errMsg =
          (response.info.error as { message?: string }).message ??
          JSON.stringify(response.info.error);
        throw new LLMError(this.name, errMsg);
      }

      const tokens = response.info.tokens;

      return {
        content,
        model: `${response.info.providerID}/${response.info.modelID}`,
        usage: {
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          totalTokens: tokens.total ?? tokens.input + tokens.output,
        },
        stopReason: response.info.finish ?? 'stop',
      };
    } finally {
      // Clean up the ephemeral session (best-effort)
      this.deleteSession(sessionID).catch(() => {/* ignore */});
    }
  }

  // opencode serve does not expose a streaming chat completions endpoint.
  // We simulate streaming by returning the full response as a single chunk.
  async *stream(messages: Message[], options: LLMOptions = {}): AsyncIterable<LLMChunk> {
    const response = await this.chat(messages, options);
    yield { content: response.content, done: false };
    yield { content: '', done: true };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildMessageBody(
    messages: Message[],
    options: LLMOptions,
  ): Record<string, unknown> {
    // Separate system message from conversation turns
    const systemParts: string[] = [];
    const turns: Message[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else {
        turns.push(msg);
      }
    }

    // Build conversation text: include all prior turns as context
    // since we create a fresh session per call we must send full history.
    let conversationText: string;

    if (turns.length === 1 && turns[0]!.role === 'user') {
      // Simple case: single user message
      conversationText = turns[0]!.content;
    } else {
      // Multi-turn: format as labeled blocks so the model sees full history
      conversationText = turns
        .map((m) => `[${m.role}]\n${m.content}`)
        .join('\n\n');
    }

    const textPart: OCSTextPart = {
      type: 'text',
      text: conversationText,
    };

    const body: Record<string, unknown> = {
      model: {
        providerID: this.providerID,
        modelID: this.modelID,
      },
      parts: [textPart],
    };

    if (systemParts.length > 0) {
      body['system'] = systemParts.join('\n\n');
    }

    return body;
  }

  private async createSession(): Promise<string> {
    const resp = await this.fetch('/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new LLMError(
        this.name,
        `Failed to create opencode session: ${resp.status} ${text}`,
        resp.status,
      );
    }

    const session = (await resp.json()) as OCSSession;
    return session.id;
  }

  private async sendMessage(
    sessionID: string,
    body: Record<string, unknown>,
  ): Promise<OCSMessageResponse> {
    const resp = await this.fetch(`/session/${sessionID}/message`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) {
        throw new LLMRateLimitError(this.name);
      }
      throw new LLMError(
        this.name,
        `opencode message API error: ${resp.status} ${text}`,
        resp.status,
      );
    }

    return (await resp.json()) as OCSMessageResponse;
  }

  private async deleteSession(sessionID: string): Promise<void> {
    await this.fetch(`/session/${sessionID}`, { method: 'DELETE' }).catch(() => {
      /* ignore cleanup failures */
    });
  }

  private async fetchWithRetry(
    path: string,
    init: RequestInit = {},
    attempt = 1,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await globalThis.fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);

      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isRetryable =
        err instanceof TypeError && err.message.includes('fetch failed');

      if ((isAbort || isRetryable) && attempt < this.retries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        console.warn(
          `[OpenCodeServer] ${isAbort ? 'Timeout' : 'Fetch failed'}, retry ${attempt}/${this.retries} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        return this.fetchWithRetry(path, init, attempt + 1);
      }

      if (isAbort) {
        throw new LLMError(this.name, `Request timed out after ${this.timeout}ms`);
      }
      throw new LLMError(
        this.name,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Keep backward compatibility - redirect fetch to fetchWithRetry
  private async fetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.fetchWithRetry(path, init);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an OpenCode server LLM provider.
 *
 * Connects to a running `opencode serve` instance and uses its session API
 * to send messages and receive responses.
 *
 * @example Start the server and connect:
 * ```bash
 * # Terminal 1
 * ANTHROPIC_API_KEY=sk-... opencode serve --port 4096
 *
 * # Terminal 2
 * OPENCODE_SERVER_URL=http://localhost:4096 node dist/src/run.js
 * ```
 *
 * @example Explicit config:
 * ```ts
 * import { openCodeServer } from '@flomatai/provider-opencode-server';
 *
 * const llm = openCodeServer({
 *   baseUrl: 'http://localhost:4096',
 *   providerID: 'anthropic',
 *   modelID: 'claude-sonnet-4-6',
 * });
 * ```
 *
 * @example Password-protected server:
 * ```ts
 * const llm = openCodeServer({
 *   baseUrl: 'http://my-server:4096',
 *   password: process.env.OPENCODE_SERVER_PASSWORD,
 *   modelID: 'claude-sonnet-4-6',
 * });
 * ```
 */
export function openCodeServer(
  config: OpenCodeServerConfig = {},
): OpenCodeServerProvider {
  return new OpenCodeServerProvider(config);
}
