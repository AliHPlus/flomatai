/**
 * Pipeline DSL — fluent builder for defining execution graphs.
 *
 * A Pipeline is a directed sequence of Steps. Each Step is a Skill, Agent,
 * or another Pipeline. Built pipelines are immutable value objects executed
 * by the Orchestrator.
 */

import type { ZodSchema } from 'zod';
import type { Skill } from './skill.js';

// ── Step Types ────────────────────────────────────────────────────────────────

export type StepKind = 'skill' | 'map' | 'filter' | 'reduce' | 'branch' | 'parallel';

/** A single resolved step in the pipeline graph. */
export interface PipelineStep {
  name: string;
  kind: StepKind;
  /** For 'skill' steps: the skill to run. */
  skill?: Skill;
  /** For 'map' | 'filter' | 'reduce': source field path (e.g. 'parse.services'). */
  sourceField?: string;
  /** For 'map': the sub-pipeline to run for each item. */
  subPipeline?: BuiltPipeline;
  /** For 'filter': predicate function. */
  predicate?: (item: unknown, index: number) => boolean;
  /** For 'reduce': reducer function. */
  reducer?: (acc: unknown, item: unknown, index: number) => unknown;
  /** For 'reduce': initial accumulator. */
  initialValue?: unknown;
  /** For 'parallel': array of sub-pipelines to run concurrently. */
  branches?: BuiltPipeline[];
  /** Concurrency limit for 'map' steps (default 1 = sequential). */
  concurrency?: number;
  /** How to handle item errors in 'map' steps. */
  onItemError?: 'fail' | 'skip' | 'retry';
  /** Max retries for items in 'map' with onItemError='retry'. */
  maxItemRetries?: number;
  /**
   * Custom input mapper. Receives the current pipeline context and
   * returns the input for this step. Default: pass entire previous output.
   */
  inputMapper?: (ctx: StepInputContext) => unknown;
  /** Skip this step if this returns true. */
  skipIf?: (ctx: StepInputContext) => boolean;
}

export interface StepInputContext {
  /** The overall pipeline input. */
  pipelineInput: unknown;
  /** Outputs from all previously completed steps, keyed by step name. */
  stepOutputs: Record<string, unknown>;
  /** The output of the immediately preceding step. */
  previousOutput: unknown;
}

// ── Built Pipeline (immutable) ────────────────────────────────────────────────

export interface BuiltPipeline {
  name: string;
  steps: PipelineStep[];
  inputSchema?: ZodSchema;
  outputSchema?: ZodSchema;
  /** Whether to save step checkpoints for resume capability. */
  checkpointing?: boolean;
}

// ── Pipeline Builder ──────────────────────────────────────────────────────────

export class PipelineBuilder {
  private readonly _name: string;
  private _steps: PipelineStep[] = [];
  private _inputSchema?: ZodSchema;
  private _outputSchema?: ZodSchema;
  private _checkpointing = false;

  constructor(name: string) {
    this._name = name;
  }

  /** Declare the input schema for validation and documentation. */
  input(schema: ZodSchema): this {
    this._inputSchema = schema;
    return this;
  }

  /** Declare the output schema for validation and documentation. */
  output(schema: ZodSchema): this {
    this._outputSchema = schema;
    return this;
  }

  /** Enable checkpoint saving for resume capability. */
  withCheckpointing(): this {
    this._checkpointing = true;
    return this;
  }

  /**
   * Add a skill step.
   *
   * @param name    Step name (must be unique within the pipeline).
   * @param skill   The skill to execute.
   * @param options Optional input mapper and skip condition.
   */
  step(
    name: string,
    skill: Skill,
    options?: {
      input?: (ctx: StepInputContext) => unknown;
      skipIf?: (ctx: StepInputContext) => boolean;
    },
  ): this {
    this._steps.push({
      name,
      kind: 'skill',
      skill,
      inputMapper: options?.input,
      skipIf: options?.skipIf,
    });
    return this;
  }

  /**
   * Map over an array field, running a sub-pipeline for each item.
   *
   * @param sourceField  Dot-path to the array in step outputs (e.g. 'parse.services').
   *                     Use '*' to use the entire previous step output as array.
   * @param subPipeline  Sub-pipeline (built or builder) to run per item.
   * @param options      Concurrency and error handling options.
   */
  mapOver(
    sourceField: string,
    subPipeline: BuiltPipeline | PipelineBuilder,
    options?: {
      concurrency?: number;
      onItemError?: 'fail' | 'skip' | 'retry';
      maxItemRetries?: number;
      name?: string;
    },
  ): this {
    const built =
      subPipeline instanceof PipelineBuilder ? subPipeline.build() : subPipeline;
    this._steps.push({
      name: options?.name ?? `map:${sourceField}`,
      kind: 'map',
      sourceField,
      subPipeline: built,
      concurrency: options?.concurrency ?? 1,
      onItemError: options?.onItemError ?? 'fail',
      maxItemRetries: options?.maxItemRetries ?? 0,
    });
    return this;
  }

  /**
   * Filter an array field, keeping only items where predicate returns true.
   */
  filter(
    sourceField: string,
    predicate: (item: unknown, index: number) => boolean,
    name?: string,
  ): this {
    this._steps.push({
      name: name ?? `filter:${sourceField}`,
      kind: 'filter',
      sourceField,
      predicate,
    });
    return this;
  }

  /**
   * Reduce an array field to a single value.
   */
  reduce(
    sourceField: string,
    reducer: (acc: unknown, item: unknown, index: number) => unknown,
    initialValue: unknown,
    name?: string,
  ): this {
    this._steps.push({
      name: name ?? `reduce:${sourceField}`,
      kind: 'reduce',
      sourceField,
      reducer,
      initialValue,
    });
    return this;
  }

  /**
   * Run multiple sub-pipelines in parallel, collecting all results.
   */
  parallel(
    branches: Array<BuiltPipeline | PipelineBuilder>,
    name?: string,
  ): this {
    this._steps.push({
      name: name ?? 'parallel',
      kind: 'parallel',
      branches: branches.map((b) =>
        b instanceof PipelineBuilder ? b.build() : b,
      ),
    });
    return this;
  }

  /**
   * Conditionally branch: run one of several sub-pipelines based on a condition.
   */
  branch(
    name: string,
    condition: (ctx: StepInputContext) => string, // returns branch name
    branches: Record<string, BuiltPipeline | PipelineBuilder>,
  ): this {
    // Implemented as a 'branch' step; orchestrator resolves at runtime
    this._steps.push({
      name,
      kind: 'branch',
      // Store condition and branches in inputMapper/predicate slots
      // (Orchestrator handles branch resolution specially)
      inputMapper: condition as unknown as (ctx: StepInputContext) => unknown,
      branches: Object.values(branches).map((b) =>
        b instanceof PipelineBuilder ? b.build() : b,
      ),
    });
    return this;
  }

  /** Finalize and return the immutable pipeline definition. */
  build(): BuiltPipeline {
    return {
      name: this._name,
      steps: [...this._steps],
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema,
      checkpointing: this._checkpointing,
    };
  }
}

// ── Public Factory ────────────────────────────────────────────────────────────

export const Pipeline = {
  /** Create a new pipeline builder. */
  create: (name: string) => new PipelineBuilder(name),
};

// ── Utility: resolve a dot-path from step outputs ─────────────────────────────

export function resolvePath(
  stepOutputs: Record<string, unknown>,
  path: string,
): unknown {
  if (path === '*') return stepOutputs;
  const parts = path.split('.');
  let current: unknown = stepOutputs;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
