/**
 * In-memory StateStore — useful for testing and single-run pipelines.
 * No persistence; data is lost on process exit.
 */

import type { StateStore, RunFilter } from './types.js';
import type { PipelineRun } from '../types.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number | null; // null = no expiry
}

export class MemoryStore implements StateStore {
  private cache = new Map<string, CacheEntry>();
  private runs = new Map<string, PipelineRun>();
  private checkpoints = new Map<string, unknown>(); // key: `${runId}::${stepName}`

  async init(): Promise<void> { /* no-op */ }
  async close(): Promise<void> { /* no-op */ }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const v = await this.get(key);
    return v !== null;
  }

  async saveRun(run: PipelineRun): Promise<void> {
    this.runs.set(run.id, { ...run });
  }

  async getRun(runId: string): Promise<PipelineRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRuns(filter?: RunFilter): Promise<PipelineRun[]> {
    let runs = [...this.runs.values()].reverse(); // newest first
    if (filter?.pipelineName) {
      runs = runs.filter((r) => r.pipelineName === filter.pipelineName);
    }
    if (filter?.status) {
      runs = runs.filter((r) => r.status === filter.status);
    }
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return runs.slice(offset, offset + limit);
  }

  async deleteRun(runId: string): Promise<void> {
    this.runs.delete(runId);
    await this.clearCheckpoints(runId);
  }

  async saveCheckpoint(runId: string, stepName: string, data: unknown): Promise<void> {
    this.checkpoints.set(`${runId}::${stepName}`, data);
  }

  async getCheckpoint(runId: string, stepName: string): Promise<unknown | null> {
    return this.checkpoints.get(`${runId}::${stepName}`) ?? null;
  }

  async clearCheckpoints(runId: string): Promise<void> {
    for (const key of this.checkpoints.keys()) {
      if (key.startsWith(`${runId}::`)) this.checkpoints.delete(key);
    }
  }
}
