/**
 * Core shared types used across all flomatai packages.
 */

// ── LLM Messages ────────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;       // for tool messages
  toolCallId?: string; // for tool result messages
}

// ── LLM Options ─────────────────────────────────────────────────────────────

export interface LLMOptions {
  /** Sampling temperature (0-2). Lower = more deterministic. */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Force JSON output mode if supported by provider. */
  responseFormat?: 'text' | 'json';
  /** Tool definitions for function calling. */
  tools?: ToolDefinition[];
  /** Stop sequences. */
  stop?: string[];
  /** Timeout in milliseconds. */
  timeout?: number;
  /** Number of retry attempts on failure. */
  retries?: number;
}

// ── LLM Response ────────────────────────────────────────────────────────────

export interface LLMResponse {
  /** The generated text content. */
  content: string;
  /** Model identifier used. */
  model: string;
  /** Token usage statistics. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Stop reason from the model. */
  stopReason?: 'stop' | 'max_tokens' | 'tool_use' | string;
  /** Tool calls requested by the model. */
  toolCalls?: ToolCall[];
}

export interface LLMChunk {
  content: string;
  done: boolean;
}

// ── Tools / Function Calling ─────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ── Run / Execution ──────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PipelineRun {
  id: string;
  pipelineName: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;   // ISO 8601
  completedAt?: string;
  durationMs?: number;
  tokensUsed: number;
  steps: StepRecord[];
}

export interface StepRecord {
  name: string;
  status: RunStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokensUsed: number;
  attempt: number;
}
