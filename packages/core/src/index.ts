/**
 * @flomatai/core — public API
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  Message,
  MessageRole,
  LLMOptions,
  LLMResponse,
  LLMChunk,
  ToolDefinition,
  ToolCall,
  PipelineRun,
  StepRecord,
  RunStatus,
} from './types.js';

// ── Errors ────────────────────────────────────────────────────────────────────
export {
  FlomatAIError,
  SkillError,
  SkillValidationError,
  SkillTimeoutError,
  PipelineError,
  StepMaxRetriesError,
  AgentError,
  AgentMaxIterationsError,
  AgentMaxDepthError,
  LLMError,
  LLMRateLimitError,
  StateError,
} from './errors.js';

// ── Logger ────────────────────────────────────────────────────────────────────
export { Logger, logger, type LogLevel, type LogEntry, type LogTransport } from './logger.js';

// ── LLM Provider ──────────────────────────────────────────────────────────────
export type { LLMProvider, LLMRegistry } from './llm-provider.js';
export { resolveLLM, withRetry, withTimeout } from './llm-provider.js';

// ── Skill ─────────────────────────────────────────────────────────────────────
export type { Skill, SkillMeta, SkillContext, SkillResult } from './skill.js';

// ── Skill Builders ────────────────────────────────────────────────────────────
export { LLMSkill, createLLMSkill, type LLMSkillConfig } from './skills/llm-skill.js';
export { TransformSkill, createTransformSkill, type TransformSkillConfig } from './skills/transform-skill.js';
export {
  IOSkill,
  createHttpGetSkill,
  createHttpPostSkill,
  createReadFileSkill,
  createWriteFileSkill,
} from './skills/io-skill.js';

// ── Pipeline ──────────────────────────────────────────────────────────────────
export {
  Pipeline,
  PipelineBuilder,
  resolvePath,
  type BuiltPipeline,
  type PipelineStep,
  type StepInputContext,
  type StepKind,
} from './pipeline.js';

// ── State ─────────────────────────────────────────────────────────────────────
export type { StateStore, RunFilter } from './state/types.js';
export { MemoryStore } from './state/memory-store.js';
export { FileStore } from './state/file-store.js';

// ── Agent ─────────────────────────────────────────────────────────────────────
export { Agent, createAgent, type AgentConfig } from './agent.js';
export type {
  AgentContext,
  AgentResult,
  AgentTraceEntry,
  AgentRunner,
  SpawnAgentConfig,
  StrategyName,
  CustomStrategyFn,
  Strategy,
} from './strategies/types.js';

// Strategy classes (for custom usage)
export { SequentialStrategy } from './strategies/sequential.js';
export { RouterStrategy } from './strategies/router.js';
export { PlanAndExecuteStrategy, type PlanAndExecuteOptions } from './strategies/plan-and-execute.js';
export { ReActStrategy, type ReActOptions } from './strategies/react.js';
export { CustomStrategy } from './strategies/custom.js';

// ── Orchestrator ──────────────────────────────────────────────────────────────
export {
  Orchestrator,
  type OrchestratorConfig,
  type OrchestratorHooks,
  type RunOptions,
} from './orchestrator.js';

// ── Testing / Mock ────────────────────────────────────────────────────────────
export {
  MockLLMProvider,
  createTestLLM,
  createMockLLMRegistry,
  type MockResponse,
} from './mock-llm.js';
