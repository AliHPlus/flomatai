/**
 * Agent — an intelligent orchestrator that composes Skills via a Strategy.
 *
 * Agents can spawn sub-agents (hierarchical up to configurable depth).
 */

import type { Skill, SkillContext } from './skill.js';
import type { LLMRegistry } from './llm-provider.js';
import type { StateStore } from './state/types.js';
import type { Logger } from './logger.js';
import { SequentialStrategy } from './strategies/sequential.js';
import { RouterStrategy } from './strategies/router.js';
import { PlanAndExecuteStrategy, type PlanAndExecuteOptions } from './strategies/plan-and-execute.js';
import { ReActStrategy, type ReActOptions } from './strategies/react.js';
import { CustomStrategy } from './strategies/custom.js';
import type {
  Strategy,
  StrategyName,
  AgentResult,
  AgentContext,
  AgentRunner,
  SpawnAgentConfig,
  CustomStrategyFn,
} from './strategies/types.js';
import { AgentMaxDepthError } from './errors.js';
import { resolveLLM } from './llm-provider.js';

// ── Agent Config ──────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Unique name for this agent. */
  name: string;
  /**
   * The agent's role/persona, used as the system prompt for decision-making.
   * Be specific about what this agent does and what constraints it follows.
   */
  role: string;
  /** Skills this agent can use. */
  skills: Skill[];
  /**
   * Which strategy to use for skill orchestration.
   * @default 'sequential'
   */
  strategy?: StrategyName;
  /**
   * The LLM registry key to use for decision-making.
   * @default 'default'
   */
  llm?: string;
  /**
   * Max iterations for 'react' strategy.
   * @default 10
   */
  maxIterations?: number;
  /**
   * Options for 'plan-and-execute' strategy.
   */
  planAndExecuteOptions?: PlanAndExecuteOptions;
  /**
   * Options for 'react' strategy.
   */
  reactOptions?: ReActOptions;
  /**
   * Custom strategy function (used when strategy='custom').
   */
  customStrategy?: CustomStrategyFn;
  /**
   * Maximum depth of sub-agent spawning (default: inherited from orchestrator).
   */
  maxDepth?: number;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class Agent implements AgentRunner {
  readonly config: AgentConfig;
  private readonly strategy: Strategy;

  constructor(config: AgentConfig) {
    this.config = config;
    this.strategy = resolveStrategy(config);
  }

  async run(
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    ctx.logger.info(`Agent "${this.config.name}" starting`);
    const result = await this.strategy.execute(this.config.skills, input, ctx);
    ctx.logger.info(
      `Agent "${this.config.name}" completed in ${result.durationMs}ms (${result.tokensUsed} tokens)`,
    );
    return result;
  }

  /** Create an AgentContext for standalone execution (outside a pipeline). */
  createContext(options: {
    llmRegistry: LLMRegistry;
    state: StateStore;
    logger: Logger;
    config?: Record<string, unknown>;
    runId?: string;
    abortController?: AbortController;
    emit?: (event: string, data: unknown) => void;
    depth?: number;
    maxDepth?: number;
  }): AgentContext {
    return buildAgentContext({
      agentName: this.config.name,
      agentRole: this.config.role,
      llmKey: this.config.llm ?? 'default',
      llmRegistry: options.llmRegistry,
      state: options.state,
      logger: options.logger.child(this.config.name),
      config: options.config ?? {},
      runId: options.runId ?? `agent-${Date.now()}`,
      abortSignal: options.abortController?.signal ?? new AbortController().signal,
      emit: options.emit ?? (() => {}),
      depth: options.depth ?? 0,
      maxDepth: options.maxDepth ?? 5,
    });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const createAgent = (config: AgentConfig): Agent => new Agent(config);

/** Ergonomic namespace: Agent.create(...) */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AgentFactory {
  export const create = createAgent;
}

// ── Internal: Context Builder ─────────────────────────────────────────────────

export function buildAgentContext(params: {
  agentName: string;
  agentRole: string;
  llmKey: string;
  llmRegistry: LLMRegistry;
  state: StateStore;
  logger: Logger;
  config: Record<string, unknown>;
  runId: string;
  abortSignal: AbortSignal;
  emit: (event: string, data: unknown) => void;
  depth: number;
  maxDepth: number;
}): AgentContext {
  let totalTokens = 0;

  const ctx: AgentContext = {
    agentName: params.agentName,
    agentRole: params.agentRole,
    llm: resolveLLM(params.llmRegistry, params.llmKey),
    getLLM: (key: string) => resolveLLM(params.llmRegistry, key),
    logger: params.logger,
    state: params.state,
    config: params.config,
    abortSignal: params.abortSignal,
    runId: params.runId,
    depth: params.depth,
    maxDepth: params.maxDepth,
    get totalTokens() { return totalTokens; },
    addTokens(n: number) { totalTokens += n; },
    emit: params.emit,

    toSkillContext(): SkillContext {
      return {
        llm: ctx.llm,
        logger: ctx.logger,
        state: ctx.state,
        emit: ctx.emit,
        config: ctx.config,
        abortSignal: ctx.abortSignal,
        runId: ctx.runId,
        getLLM: ctx.getLLM,
      };
    },

    spawnAgent(spawnConfig: SpawnAgentConfig): AgentRunner {
      if (params.depth >= params.maxDepth) {
        throw new AgentMaxDepthError(spawnConfig.name, params.maxDepth);
      }

      const childAgent = new Agent({
        name: spawnConfig.name,
        role: spawnConfig.role,
        skills: spawnConfig.skills,
        strategy: spawnConfig.strategy,
        llm: spawnConfig.llm ?? params.llmKey,
        maxIterations: spawnConfig.maxIterations,
        customStrategy: spawnConfig.customStrategy,
      });

      const childCtx = buildAgentContext({
        ...params,
        agentName: spawnConfig.name,
        agentRole: spawnConfig.role,
        llmKey: spawnConfig.llm ?? params.llmKey,
        logger: params.logger.child(spawnConfig.name),
        depth: params.depth + 1,
      });

      params.emit('agent:spawn', {
        parent: params.agentName,
        child: spawnConfig.name,
        depth: params.depth + 1,
      });

      return {
        run: (input: unknown) => childAgent.run(input, childCtx),
      };
    },
  };

  return ctx;
}

// ── Internal: Strategy Resolution ─────────────────────────────────────────────

function resolveStrategy(config: AgentConfig): Strategy {
  const strategyName = config.strategy ?? 'sequential';

  switch (strategyName) {
    case 'sequential':
      return new SequentialStrategy();
    case 'router':
      return new RouterStrategy();
    case 'plan-and-execute':
      return new PlanAndExecuteStrategy(config.planAndExecuteOptions);
    case 'react':
      return new ReActStrategy(config.reactOptions);
    case 'custom':
      if (!config.customStrategy) {
        throw new Error(`Agent "${config.name}": strategy='custom' requires customStrategy function`);
      }
      return new CustomStrategy(config.customStrategy);
    default:
      throw new Error(`Unknown agent strategy: "${strategyName as string}"`);
  }
}
