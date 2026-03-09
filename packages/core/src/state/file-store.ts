/**
 * File-based StateStore — persists data as JSON files.
 * Good for development and small-scale use. No external dependencies.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { StateStore, RunFilter } from './types.js';
import type { PipelineRun } from '../types.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number | null;
}

interface FileStoreData {
  cache: Record<string, CacheEntry>;
  runs: Record<string, PipelineRun>;
  checkpoints: Record<string, unknown>;
}

export class FileStore implements StateStore {
  private readonly dataFile: string;
  private data: FileStoreData = { cache: {}, runs: {}, checkpoints: {} };

  constructor(dataDir = '.flomatai') {
    this.dataFile = join(dataDir, 'store.json');
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.dataFile), { recursive: true });
    if (existsSync(this.dataFile)) {
      try {
        const raw = await readFile(this.dataFile, 'utf-8');
        this.data = JSON.parse(raw) as FileStoreData;
      } catch {
        this.data = { cache: {}, runs: {}, checkpoints: {} };
      }
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.dataFile), { recursive: true });
    await writeFile(this.dataFile, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data.cache[key];
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      delete this.data.cache[key];
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.data.cache[key] = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    };
    await this.flush();
  }

  async delete(key: string): Promise<void> {
    delete this.data.cache[key];
    await this.flush();
  }

  async has(key: string): Promise<boolean> {
    const v = await this.get(key);
    return v !== null;
  }

  async saveRun(run: PipelineRun): Promise<void> {
    this.data.runs[run.id] = { ...run };
    await this.flush();
  }

  async getRun(runId: string): Promise<PipelineRun | null> {
    return this.data.runs[runId] ?? null;
  }

  async listRuns(filter?: RunFilter): Promise<PipelineRun[]> {
    let runs = Object.values(this.data.runs).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
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
    delete this.data.runs[runId];
    await this.clearCheckpoints(runId);
  }

  async saveCheckpoint(runId: string, stepName: string, data: unknown): Promise<void> {
    this.data.checkpoints[`${runId}::${stepName}`] = data;
    await this.flush();
  }

  async getCheckpoint(runId: string, stepName: string): Promise<unknown | null> {
    return this.data.checkpoints[`${runId}::${stepName}`] ?? null;
  }

  async clearCheckpoints(runId: string): Promise<void> {
    for (const key of Object.keys(this.data.checkpoints)) {
      if (key.startsWith(`${runId}::`)) delete this.data.checkpoints[key];
    }
    await this.flush();
  }
}
