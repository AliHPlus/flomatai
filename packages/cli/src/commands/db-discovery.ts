/**
 * db-discovery — locate SQLite state databases across a project.
 *
 * Resolution order (first match wins for single-DB commands; all are merged for list):
 *   1. --db flag (explicit path)
 *   2. .flomatai/*.db in cwd
 *   3. workflows/[name]/.flomatai/*.db (recursive, one level of workflow subdirs)
 *   4. Legacy hardcoded paths in cwd
 */

import { existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { sqliteStore } from '@flomatai/state-sqlite';
import type { SQLiteStore } from '@flomatai/state-sqlite';

/** Find all .db files under a given directory (non-recursive). */
function dbsInDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Discover all SQLite DB paths relevant to the cwd.
 * Checks:
 *   - .flomatai/ in cwd
 *   - workflows/[name]/.flomatai/ (one level deep)
 *   - legacy hardcoded names
 */
export function discoverDbPaths(cwd: string = process.cwd()): string[] {
  const found = new Set<string>();

  // 1. .flomatai/ in cwd
  for (const p of dbsInDir(join(cwd, '.flomatai'))) found.add(p);

  // 2. workflows/*/.flomatai/
  const workflowsDir = join(cwd, 'workflows');
  if (existsSync(workflowsDir)) {
    try {
      for (const entry of readdirSync(workflowsDir)) {
        const wfDir = join(workflowsDir, entry, '.flomatai');
        for (const p of dbsInDir(wfDir)) found.add(p);
      }
    } catch { /* ignore */ }
  }

  // 3. Legacy hardcoded paths (backward compat)
  for (const p of [
    join(cwd, '.flomatai/verlivo.db'),
    join(cwd, '.flomatai/verlivo-impl.db'),
    join(cwd, '.flomatai/state.db'),
  ]) {
    if (existsSync(p)) found.add(p);
  }

  return [...found];
}

/** Open a single store. Caller must close it. */
export async function openStore(dbPath: string): Promise<SQLiteStore> {
  const store = sqliteStore(dbPath);
  await store.init();
  return store;
}

/**
 * Resolve a state store for commands that need exactly one DB.
 * If multiple are found, picks the first (most recently modified per fs order).
 * Returns null if none found.
 */
export async function resolveStore(
  dbPath?: string,
): Promise<{ store: SQLiteStore; dbPath: string } | null> {
  if (dbPath) {
    if (!existsSync(dbPath)) return null;
    return { store: await openStore(dbPath), dbPath };
  }

  const paths = discoverDbPaths();
  if (paths.length === 0) return null;

  const chosen = paths[0]!;
  return { store: await openStore(chosen), dbPath: chosen };
}

/**
 * Resolve all stores for commands that merge across multiple DBs (list).
 * Returns [] if none found.
 */
export async function resolveAllStores(
  dbPath?: string,
): Promise<Array<{ store: SQLiteStore; dbPath: string }>> {
  if (dbPath) {
    if (!existsSync(dbPath)) return [];
    return [{ store: await openStore(dbPath), dbPath }];
  }

  const paths = discoverDbPaths();
  const stores: Array<{ store: SQLiteStore; dbPath: string }> = [];
  for (const p of paths) {
    stores.push({ store: await openStore(p), dbPath: p });
  }
  return stores;
}

export function noDbFoundError(): void {
  console.error('[flomatai] No state database found.');
  console.error('  Run from inside a project or workflow directory,');
  console.error('  or specify --db <path>.');
}
