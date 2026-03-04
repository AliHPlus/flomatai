/**
 * StateStore — pluggable persistence interface.
 *
 * Adapters: @flomatai/state-file (default), @flomatai/state-sqlite,
 *           @flomatai/state-redis, @flomatai/state-postgres
 */

import type { PipelineRun } from '../types.js';

// ── Core Store Interface ──────────────────────────────────────────────────────

export interface StateStore {
  /** Initialize the store (open connections, create tables, etc.). */
  init(): Promise<void>;
  /** Tear down the store (close connections). */
  close(): Promise<void>;

  // ── Key/Value ────────────────────────────────────────────────────────────

  /** Get a value by key. Returns null if not found or expired. */
  get<T>(key: string): Promise<T | null>;
  /** Set a value with optional TTL (seconds). */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Delete a key. */
  delete(key: string): Promise<void>;
  /** Check if a key exists. */
  has(key: string): Promise<boolean>;

  // ── Run History ──────────────────────────────────────────────────────────

  /** Persist a pipeline run (upsert by run.id). */
  saveRun(run: PipelineRun): Promise<void>;
  /** Retrieve a run by ID. */
  getRun(runId: string): Promise<PipelineRun | null>;
  /** List runs, newest first. */
  listRuns(filter?: RunFilter): Promise<PipelineRun[]>;

  // ── Checkpoints (for resume) ─────────────────────────────────────────────

  /** Save a step checkpoint so a failed run can be resumed. */
  saveCheckpoint(runId: string, stepName: string, data: unknown): Promise<void>;
  /** Get a step checkpoint. */
  getCheckpoint(runId: string, stepName: string): Promise<unknown | null>;
  /** Clear all checkpoints for a run (after successful completion). */
  clearCheckpoints(runId: string): Promise<void>;
}

export interface RunFilter {
  pipelineName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
