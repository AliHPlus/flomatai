/**
 * @flomatai/state-sqlite
 *
 * SQLite-backed state store for flomatai.
 * Features:
 *  - Run history with full step records
 *  - Key/value cache with TTL expiry
 *  - Step checkpoints for resume capability
 *  - Zero-dependency (uses better-sqlite3 for synchronous access wrapped in async API)
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { StateStore, RunFilter } from '@flomatai/core';
import type { PipelineRun } from '@flomatai/core';
import { StateError } from '@flomatai/core';

// ── SQLiteStore ───────────────────────────────────────────────────────────────

export class SQLiteStore implements StateStore {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath = '.flomatai/state.db') {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.createTables();
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private get conn(): Database.Database {
    if (!this.db) throw new StateError('SQLiteStore not initialized. Call init() first.');
    return this.db;
  }

  private createTables(): void {
    this.conn.exec(`
      CREATE TABLE IF NOT EXISTS kv_cache (
        key       TEXT PRIMARY KEY,
        value     TEXT NOT NULL,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id             TEXT PRIMARY KEY,
        pipeline_name  TEXT NOT NULL,
        status         TEXT NOT NULL,
        input          TEXT,
        output         TEXT,
        error          TEXT,
        started_at     TEXT NOT NULL,
        completed_at   TEXT,
        duration_ms    INTEGER,
        tokens_used    INTEGER DEFAULT 0,
        steps          TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_runs_pipeline ON pipeline_runs(pipeline_name);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON pipeline_runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_started ON pipeline_runs(started_at DESC);

      CREATE TABLE IF NOT EXISTS checkpoints (
        run_id     TEXT NOT NULL,
        step_name  TEXT NOT NULL,
        data       TEXT NOT NULL,
        saved_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (run_id, step_name)
      );
    `);
  }

  // ── Key/Value ──────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();
    const row = this.conn
      .prepare('SELECT value, expires_at FROM kv_cache WHERE key = ?')
      .get(key) as { value: string; expires_at: number | null } | undefined;

    if (!row) return null;
    if (row.expires_at !== null && now > row.expires_at) {
      this.conn.prepare('DELETE FROM kv_cache WHERE key = ?').run(key);
      return null;
    }

    try { return JSON.parse(row.value) as T; }
    catch { return row.value as unknown as T; }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    const serialized = JSON.stringify(value);
    this.conn
      .prepare(
        'INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, ?)',
      )
      .run(key, serialized, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.conn.prepare('DELETE FROM kv_cache WHERE key = ?').run(key);
  }

  async has(key: string): Promise<boolean> {
    const v = await this.get(key);
    return v !== null;
  }

  // ── Run History ────────────────────────────────────────────────────────────

  async saveRun(run: PipelineRun): Promise<void> {
    this.conn
      .prepare(`
        INSERT OR REPLACE INTO pipeline_runs
          (id, pipeline_name, status, input, output, error, started_at, completed_at, duration_ms, tokens_used, steps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        run.id,
        run.pipelineName,
        run.status,
        JSON.stringify(run.input ?? null),
        JSON.stringify(run.output ?? null),
        run.error ?? null,
        run.startedAt,
        run.completedAt ?? null,
        run.durationMs ?? null,
        run.tokensUsed ?? 0,
        JSON.stringify(run.steps ?? []),
      );
  }

  async getRun(runId: string): Promise<PipelineRun | null> {
    const row = this.conn
      .prepare('SELECT * FROM pipeline_runs WHERE id = ?')
      .get(runId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToRun(row);
  }

  async listRuns(filter?: RunFilter): Promise<PipelineRun[]> {
    let sql = 'SELECT * FROM pipeline_runs WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.pipelineName) {
      sql += ' AND pipeline_name = ?';
      params.push(filter.pipelineName);
    }
    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }

    sql += ' ORDER BY started_at DESC';
    sql += ` LIMIT ${filter?.limit ?? 50} OFFSET ${filter?.offset ?? 0}`;

    const rows = this.conn.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(this.rowToRun);
  }

  // ── Checkpoints ────────────────────────────────────────────────────────────

  async saveCheckpoint(runId: string, stepName: string, data: unknown): Promise<void> {
    this.conn
      .prepare(
        'INSERT OR REPLACE INTO checkpoints (run_id, step_name, data, saved_at) VALUES (?, ?, ?, datetime("now"))',
      )
      .run(runId, stepName, JSON.stringify(data));
  }

  async getCheckpoint(runId: string, stepName: string): Promise<unknown | null> {
    const row = this.conn
      .prepare('SELECT data FROM checkpoints WHERE run_id = ? AND step_name = ?')
      .get(runId, stepName) as { data: string } | undefined;

    if (!row) return null;
    try { return JSON.parse(row.data); }
    catch { return null; }
  }

  async clearCheckpoints(runId: string): Promise<void> {
    this.conn.prepare('DELETE FROM checkpoints WHERE run_id = ?').run(runId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private rowToRun(row: Record<string, unknown>): PipelineRun {
    return {
      id: row['id'] as string,
      pipelineName: row['pipeline_name'] as string,
      status: row['status'] as PipelineRun['status'],
      input: safeJsonParse(row['input'] as string | null),
      output: safeJsonParse(row['output'] as string | null),
      error: (row['error'] as string | null) ?? undefined,
      startedAt: row['started_at'] as string,
      completedAt: (row['completed_at'] as string | null) ?? undefined,
      durationMs: (row['duration_ms'] as number | null) ?? undefined,
      tokensUsed: (row['tokens_used'] as number) ?? 0,
      steps: (safeJsonParse(row['steps'] as string) as PipelineRun['steps']) ?? [],
    };
  }
}

function safeJsonParse(s: string | null): unknown {
  if (s === null) return undefined;
  try { return JSON.parse(s); } catch { return s; }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a SQLite state store.
 *
 * @example
 * ```ts
 * import { sqliteStore } from '@flomatai/state-sqlite';
 *
 * const store = sqliteStore('.flomatai/state.db');
 * ```
 */
export function sqliteStore(dbPath?: string): SQLiteStore {
  return new SQLiteStore(dbPath);
}
