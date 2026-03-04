/**
 * Agent strategy types — shared across all strategy implementations.
 */

import type { Skill, SkillContext } from '../skill.js';
import type { LLMProvider } from '../llm-provider.js';
import type { Logger } from '../logger.js';
import type { StateStore } from '../state/types.js';

// ── Agent Trace ───────────────────────────────────────────────────────────────

export type AgentTraceEntryType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'plan'
  | 'replan'
  | 'reflection'
  | 'finish'
  | 'route'
  | 'spawn';

export interface AgentTraceEntry {
  type: AgentTraceEntryType;
  iteration?: number;
  skill?: string;
  input?: unknown;
  output?: unknown;
  content?: unknown;
  timestamp: string;
}

// ── Agent Result ──────────────────────────────────────────────────────────────

export interface AgentResult {
  output: unknown;
  trace: AgentTraceEntry[];
  tokensUsed: number;
  durationMs: number;
}

// ── Agent Context ─────────────────────────────────────────────────────────────

export interface AgentContext {
  agentName: string;
  agentRole: string;
  llm: LLMProvider;
  getLLM: (key: string) => LLMProvider;
  logger: Logger;
  state: StateStore;
  config: Record<string, unknown>;
  abortSignal: AbortSignal;
  runId: string;
  depth: number;
  maxDepth: number;
  totalTokens: number;
  addTokens: (n: number) => void;
  emit: (event: string, data: unknown) => void;
  /** Spawn a sub-agent. */
  spawnAgent: (config: SpawnAgentConfig) => AgentRunner;
  /** Get a SkillContext from this AgentContext. */
  toSkillContext(): SkillContext;
}

export interface SpawnAgentConfig {
  name: string;
  role: string;
  skills: Skill[];
  strategy: StrategyName;
  llm?: string;
  maxIterations?: number;
  customStrategy?: CustomStrategyFn;
}

export type StrategyName =
  | 'sequential'
  | 'router'
  | 'plan-and-execute'
  | 'react'
  | 'custom';

export type CustomStrategyFn = (
  skills: Skill[],
  input: unknown,
  ctx: AgentContext,
) => Promise<AgentResult>;

// ── Strategy Interface ────────────────────────────────────────────────────────

export interface Strategy {
  execute(skills: Skill[], input: unknown, ctx: AgentContext): Promise<AgentResult>;
}

/** Minimal agent runner interface (to avoid circular imports). */
export interface AgentRunner {
  run(input: unknown, ctx: AgentContext): Promise<AgentResult>;
}
