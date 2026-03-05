/**
 * Orchestrator — the runtime engine that executes pipelines.
 *
 * Responsibilities:
 *  - Validate pipeline input/output
 *  - Execute steps in order, passing outputs to inputs
 *  - Handle map/filter/reduce/parallel/branch steps
 *  - Retry failed steps with exponential backoff
 *  - Save checkpoints for resume capability
 *  - Record full run history
 *  - Fire lifecycle hooks
 *  - Manage LLM registry and state store
 */

import { randomUUID } from 'crypto';
import type { LLMRegistry } from './llm-provider.js';
import { resolveLLM } from './llm-provider.js';
import type { StateStore } from './state/types.js';
import { MemoryStore } from './state/memory-store.js';
import type { Logger } from './logger.js';
import { logger as defaultLogger } from './logger.js';
import type { BuiltPipeline, PipelineStep, StepInputContext } from './pipeline.js';
import { resolvePath } from './pipeline.js';
import type { SkillContext } from './skill.js';
import type { PipelineRun, StepRecord } from './types.js';
import { PipelineError, StepMaxRetriesError } from './errors.js';
import { buildAgentContext } from './agent.js';
import type { Agent } from './agent.js';

// ── Orchestrator Config ───────────────────────────────────────────────────────

export interface OrchestratorConfig {
  /**
   * LLM registry. 'default' key is used when no specific LLM is requested.
   * @example { default: anthropic({ model: 'claude-3-5-sonnet' }) }
   */
  llm: LLMRegistry;
  /**
   * State store for persistence, caching, and run history.
   * @default MemoryStore
   */
  state?: StateStore;
  /**
   * Root logger. Defaults to console logger.
   */
  logger?: Logger;
  /**
   * Lifecycle hooks.
   */
  hooks?: OrchestratorHooks;
  /**
   * Global configuration passed to all skill/agent contexts.
   */
  config?: Record<string, unknown>;
  /**
   * Maximum sub-agent depth for hierarchical agents.
   * @default 5
   */
  maxAgentDepth?: number;
}

export interface OrchestratorHooks {
  /** Called before the pipeline starts. */
  beforePipeline?: (pipeline: BuiltPipeline, input: unknown, runId: string) => void | Promise<void>;
  /** Called after the pipeline completes (success or failure). */
  afterPipeline?: (pipeline: BuiltPipeline, run: PipelineRun) => void | Promise<void>;
  /** Called before each step executes. */
  beforeStep?: (step: PipelineStep, input: unknown, runId: string) => void | Promise<void>;
  /** Called after each step completes (success or failure). */
  afterStep?: (step: PipelineStep, record: StepRecord) => void | Promise<void>;
  /** Called on any error. */
  onError?: (step: PipelineStep | null, error: Error, runId: string) => void | Promise<void>;
}

// ── Run Options ───────────────────────────────────────────────────────────────

export interface RunOptions {
  /** External run ID (auto-generated if not provided). */
  runId?: string;
  /** Override the LLM for this run. */
  llm?: string;
  /** Abort controller for cancellation. */
  abortController?: AbortController;
  /**
   * Resume from a previous run's checkpoints.
   * Provide the runId of the run to resume.
   */
  resumeFromRunId?: string;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class Orchestrator {
  private readonly llmRegistry: LLMRegistry;
  private readonly state: StateStore;
  private readonly log: Logger;
  private readonly hooks: OrchestratorHooks;
  private readonly globalConfig: Record<string, unknown>;
  private readonly maxAgentDepth: number;
  private initialized = false;

  constructor(config: OrchestratorConfig) {
    this.llmRegistry = config.llm;
    this.state = config.state ?? new MemoryStore();
    this.log = config.logger ?? defaultLogger;
    this.hooks = config.hooks ?? {};
    this.globalConfig = config.config ?? {};
    this.maxAgentDepth = config.maxAgentDepth ?? 5;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.state.init();
      this.initialized = true;
    }
  }

  /**
   * Execute a pipeline with the given input.
   */
  async run<TOutput = unknown>(
    pipeline: BuiltPipeline,
    input: unknown,
    options: RunOptions = {},
  ): Promise<{ output: TOutput; run: PipelineRun }> {
    await this.ensureInit();

    const runId = options.runId ?? randomUUID();
    const abortController = options.abortController ?? new AbortController();
    const events: Array<{ event: string; data: unknown }> = [];

    const emit = (event: string, data: unknown): void => {
      events.push({ event, data });
      this.log.debug(`event:${event}`, data);
      // Accumulate token usage from LLM skill responses
      if (event === 'llm:response') {
        const d = data as { tokens?: number };
        if (typeof d.tokens === 'number') totalTokens += d.tokens;
      }
    };

    const run: PipelineRun = {
      id: runId,
      pipelineName: pipeline.name,
      status: 'running',
      input,
      startedAt: new Date().toISOString(),
      tokensUsed: 0,
      steps: [],
    };

    await this.state.saveRun(run);
    await this.hooks.beforePipeline?.(pipeline, input, runId);

    this.log.info(`Pipeline "${pipeline.name}" starting [${runId}]`);

    // Validate pipeline input
    if (pipeline.inputSchema) {
      const result = pipeline.inputSchema.safeParse(input);
      if (!result.success) {
        throw new PipelineError(
          pipeline.name,
          `Input validation failed: ${result.error.message}`,
        );
      }
    }

    // Build skill context factory
    const makeSkillCtx = (): SkillContext => ({
      llm: resolveLLM(this.llmRegistry, options.llm ?? 'default'),
      logger: this.log,
      state: this.state,
      emit,
      config: this.globalConfig,
      abortSignal: abortController.signal,
      runId,
      getLLM: (key: string) => resolveLLM(this.llmRegistry, key),
    });

    // Execute steps
    const stepOutputs: Record<string, unknown> = {};
    let previousOutput: unknown = input;
    let totalTokens = 0;  // NOTE: also incremented by emit('llm:response') above

    try {
      for (const step of pipeline.steps) {
        if (abortController.signal.aborted) {
          throw new PipelineError(pipeline.name, 'Pipeline was cancelled', step.name);
        }

        // Resolve step input
        const stepInputCtx: StepInputContext = {
          pipelineInput: input,
          stepOutputs,
          previousOutput,
        };

        // Check skip condition
        if (step.skipIf?.(stepInputCtx)) {
          this.log.debug(`Step "${step.name}" skipped`);
          continue;
        }

        const stepInput = step.inputMapper
          ? step.inputMapper(stepInputCtx)
          : previousOutput;

        await this.hooks.beforeStep?.(step, stepInput, runId);

        const stepRecord: StepRecord = {
          name: step.name,
          status: 'running',
          input: stepInput,
          startedAt: new Date().toISOString(),
          tokensUsed: 0,
          attempt: 1,
        };
        run.steps.push(stepRecord);

        // Check for checkpoint (resume)
        if (options.resumeFromRunId && pipeline.checkpointing) {
          const checkpoint = await this.state.getCheckpoint(
            options.resumeFromRunId,
            step.name,
          );
          if (checkpoint !== null) {
            this.log.info(`Step "${step.name}" resumed from checkpoint`);
            stepOutputs[step.name] = checkpoint;
            previousOutput = checkpoint;
            stepRecord.status = 'completed';
            stepRecord.output = checkpoint;
            continue;
          }
        }

        // Execute step
        const t0 = Date.now();
        let stepOutput: unknown;
        const maxAttempts = (step.skill?.meta.retries ?? 0) + 1;

        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          stepRecord.attempt = attempt;
          try {
            stepOutput = await this.executeStep(
              step,
              stepInput,
              makeSkillCtx,
              runId,
              abortController.signal,
              emit,
            );
            lastError = null;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxAttempts) {
              const delay = Math.min(500 * Math.pow(2, attempt - 1), 10_000);
              this.log.warn(
                `Step "${step.name}" attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms`,
              );
              await this.hooks.onError?.(step, lastError, runId);
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        }

        if (lastError) {
          throw new StepMaxRetriesError(pipeline.name, step.name, maxAttempts, lastError);
        }

        const durationMs = Date.now() - t0;
        stepRecord.status = 'completed';
        stepRecord.output = stepOutput;
        stepRecord.completedAt = new Date().toISOString();
        stepRecord.durationMs = durationMs;

        // Save checkpoint if enabled
        if (pipeline.checkpointing) {
          await this.state.saveCheckpoint(runId, step.name, stepOutput);
        }

        stepOutputs[step.name] = stepOutput;
        previousOutput = stepOutput;

        await this.state.saveRun(run);
        await this.hooks.afterStep?.(step, stepRecord);

        this.log.debug(`Step "${step.name}" completed in ${durationMs}ms`);
      }

      // Validate pipeline output
      let finalOutput: TOutput = previousOutput as TOutput;
      if (pipeline.outputSchema) {
        const result = pipeline.outputSchema.safeParse(finalOutput);
        if (!result.success) {
          this.log.warn(`Pipeline "${pipeline.name}" output failed schema validation`, result.error.issues);
        }
      }

      run.status = 'completed';
      run.output = finalOutput;
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.startedAt).getTime();
      run.tokensUsed = totalTokens;

      await this.state.saveRun(run);
      if (pipeline.checkpointing) await this.state.clearCheckpoints(runId);
      await this.hooks.afterPipeline?.(pipeline, run);

      this.log.info(
        `Pipeline "${pipeline.name}" completed in ${run.durationMs}ms [${runId}]`,
      );

      return { output: finalOutput, run };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      run.status = 'failed';
      run.error = error.message;
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.startedAt).getTime();

      await this.state.saveRun(run);
      await this.hooks.onError?.(null, error, runId);
      await this.hooks.afterPipeline?.(pipeline, run);

      this.log.error(`Pipeline "${pipeline.name}" failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a single pipeline step.
   */
  private async executeStep(
    step: PipelineStep,
    input: unknown,
    makeSkillCtx: () => SkillContext,
    runId: string,
    abortSignal: AbortSignal,
    emit: (event: string, data: unknown) => void,
  ): Promise<unknown> {
    switch (step.kind) {
      case 'skill': {
        if (!step.skill) throw new PipelineError('?', `Step "${step.name}" has no skill`);
        return step.skill.execute(
          input as Parameters<typeof step.skill.execute>[0],
          makeSkillCtx(),
        );
      }

      case 'map': {
        const source = this.resolveSource(step.sourceField!, input);
        if (!Array.isArray(source)) {
          throw new PipelineError('?', `Step "${step.name}" map source "${step.sourceField}" is not an array`);
        }
        return this.runMap(step, source, makeSkillCtx, runId, abortSignal, emit);
      }

      case 'filter': {
        const source = this.resolveSource(step.sourceField!, input);
        if (!Array.isArray(source)) return [];
        return source.filter((item, i) => step.predicate?.(item, i) ?? true);
      }

      case 'reduce': {
        const source = this.resolveSource(step.sourceField!, input);
        if (!Array.isArray(source)) return step.initialValue;
        return source.reduce(
          (acc, item, i) => step.reducer?.(acc, item, i) ?? acc,
          step.initialValue,
        );
      }

      case 'parallel': {
        if (!step.branches) return [];
        const results = await Promise.all(
          step.branches.map((branch) =>
            this.run(branch, input, { runId: `${runId}:${branch.name}`, abortController: { signal: abortSignal } as AbortController }),
          ),
        );
        return results.map((r) => r.output);
      }

      case 'branch': {
        // inputMapper stores the condition function
        const branchKey = (step.inputMapper as (ctx: unknown) => string)(input);
        const selectedBranch = step.branches?.find((b) => b.name === branchKey);
        if (!selectedBranch) {
          this.log.warn(`Branch "${step.name}": no branch matched key "${branchKey}"`);
          return input;
        }
        const result = await this.run(selectedBranch, input, {
          runId: `${runId}:${selectedBranch.name}`,
          abortController: { signal: abortSignal } as AbortController,
        });
        return result.output;
      }

      default:
        throw new PipelineError('?', `Unknown step kind: "${(step as PipelineStep).kind}"`);
    }
  }

  /**
   * Run a map step: execute sub-pipeline for each item.
   */
  private async runMap(
    step: PipelineStep,
    items: unknown[],
    makeSkillCtx: () => SkillContext,
    runId: string,
    abortSignal: AbortSignal,
    emit: (event: string, data: unknown) => void,
  ): Promise<unknown[]> {
    const concurrency = step.concurrency ?? 1;
    const results: unknown[] = new Array(items.length);

    // Process in batches of `concurrency`
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const idx = i + batchIdx;
          const maxAttempts = (step.maxItemRetries ?? 0) + 1;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const result = await this.run(step.subPipeline!, item, {
                runId: `${runId}:${step.name}[${idx}]`,
                abortController: { signal: abortSignal } as AbortController,
              });
              return { idx, output: result.output, error: null };
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              if (attempt < maxAttempts) {
                const delay = Math.min(500 * Math.pow(2, attempt - 1), 5_000);
                this.log.warn(`Map item ${idx} attempt ${attempt}/${maxAttempts} failed. Retrying in ${delay}ms`);
                await new Promise((r) => setTimeout(r, delay));
              } else {
                if (step.onItemError === 'skip') {
                  this.log.warn(`Map item ${idx} failed and was skipped: ${error.message}`);
                  return { idx, output: null, error };
                }
                throw error;
              }
            }
          }
          return { idx, output: null, error: null };
        }),
      );

      for (const r of batchResults) {
        results[r.idx] = r.output;
      }
    }

    // Filter out nulls from skipped items
    return step.onItemError === 'skip'
      ? results.filter((r) => r !== null)
      : results;
  }

  /**
   * Resolve a source field path from the step input.
   */
  private resolveSource(sourceField: string, input: unknown): unknown {
    if (sourceField === '*') return input;
    if (Array.isArray(input)) return input;
    const parts = sourceField.split('.');
    let current: unknown = input;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /** Get the state store (for external inspection). */
  get stateStore(): StateStore {
    return this.state;
  }

  /** Get the LLM registry. */
  get llm(): LLMRegistry {
    return this.llmRegistry;
  }
}
