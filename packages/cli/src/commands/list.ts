/**
 * flomatai list — list recent pipeline runs.
 *
 * Auto-discovers SQLite databases in:
 *   .flomatai/*.db          (cwd)
 *   workflows/[name]/.flomatai/*.db  (workflow subdirs)
 * All discovered DBs are merged and sorted by start time.
 */

import type { Command } from 'commander';
import { resolveAllStores, noDbFoundError } from './db-discovery.js';

export function registerListCommand(program: Command, _getOrchestrator: () => unknown): void {
  program
    .command('list')
    .description('List recent pipeline runs.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('-n, --pipeline <name>', 'Filter by pipeline name')
    .option('-s, --status <status>', 'Filter by status (completed|failed|running|pending)')
    .option('-l, --limit <n>', 'Max results per database (default: 20)', '20')
    .action(async (options: Record<string, string>) => {
      const dbPath = options['db'] as string | undefined;
      const stores = await resolveAllStores(dbPath);

      if (stores.length === 0) {
        noDbFoundError();
        process.exit(1);
      }

      const limit = parseInt(options['limit'] ?? '20');

      // Collect runs from all stores
      type Run = {
        id: string;
        pipelineName: string;
        status: string;
        startedAt: string;
        tokensUsed: number;
        _db: string;
      };

      const allRuns: Run[] = [];

      for (const { store, dbPath: dp } of stores) {
        try {
          const runs = (await store.listRuns({
            pipelineName: options['pipeline'],
            status: options['status'],
            limit,
          })) as unknown as Run[];
          for (const r of runs) {
            allRuns.push({ ...r, _db: dp });
          }
        } finally {
          await store.close();
        }
      }

      if (allRuns.length === 0) {
        console.log('No runs found.');
        return;
      }

      // Sort merged results newest-first
      allRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      const pad = (s: string, n: number) => s.substring(0, n).padEnd(n);
      const statusEmoji: Record<string, string> = {
        completed: '✓', failed: '✗', running: '⟳', pending: '○', cancelled: '⊘',
      };

      const showDb = stores.length > 1 || !dbPath;
      const dbColWidth = showDb ? 28 : 0;
      const dbHeader = showDb ? ` ${pad('DATABASE', dbColWidth - 1)}` : '';

      console.log(`\n${pad('STAT', 4)} ${pad('RUN ID', 38)} ${pad('PIPELINE', 30)} ${pad('STARTED', 24)} TOKENS${dbHeader}`);
      console.log('─'.repeat(showDb ? 110 + dbColWidth : 110));

      for (const run of allRuns) {
        const emoji = statusEmoji[run.status] ?? '?';
        const dbSuffix = showDb ? ` ${pad(run._db.replace(process.cwd() + '/', ''), dbColWidth)}` : '';
        console.log(
          `${emoji}    ${pad(run.id, 38)} ${pad(run.pipelineName, 30)} ${pad(run.startedAt, 24)} ${String(run.tokensUsed).padEnd(6)}${dbSuffix}`,
        );
      }

      console.log(`\n${allRuns.length} run(s) shown${stores.length > 1 ? ` across ${stores.length} databases` : ''}.`);
    });
}
