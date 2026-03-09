/**
 * flomatai clean — delete pipeline runs from the database.
 *
 * Usage:
 *   flomatai clean                         # interactive: asks for confirmation, deletes all
 *   flomatai clean --failed                # delete only failed runs
 *   flomatai clean --status running        # delete by status
 *   flomatai clean --run <id>              # delete a specific run
 *   flomatai clean --all --yes             # delete everything without prompt
 */

import type { Command } from 'commander';
import { resolveAllStores, noDbFoundError } from './db-discovery.js';

export function registerCleanCommand(program: Command): void {
  program
    .command('clean')
    .description('Delete pipeline runs from the database.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('--run <id>', 'Delete a specific run by ID (prefix match supported)')
    .option('--failed', 'Delete only failed runs')
    .option('--status <status>', 'Delete runs with a specific status (completed|failed|running|pending)')
    .option('--all', 'Delete all runs')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options: Record<string, string | boolean>) => {
      const dbPath = options['db'] as string | undefined;
      const stores = await resolveAllStores(dbPath);

      if (stores.length === 0) {
        noDbFoundError();
        process.exit(1);
      }

      const targetRunId = options['run'] as string | undefined;
      const targetStatus = options['failed']
        ? 'failed'
        : (options['status'] as string | undefined);
      const deleteAll = !!options['all'] || (!targetRunId && !targetStatus);
      const skipConfirm = !!options['yes'];

      type Run = { id: string; pipelineName: string; status: string; startedAt: string };

      // Collect matching runs across all DBs
      const toDelete: Array<{ run: Run; dbPath: string; storeIdx: number }> = [];

      for (let i = 0; i < stores.length; i++) {
        const { store, dbPath: dp } = stores[i]!;
        try {
          let runs: Run[];
          if (targetRunId) {
            // Exact + prefix match
            const all = (await store.listRuns({ limit: 1000 })) as Run[];
            runs = all.filter((r) => r.id === targetRunId || r.id.startsWith(targetRunId));
          } else if (targetStatus) {
            runs = (await store.listRuns({ status: targetStatus, limit: 1000 })) as Run[];
          } else {
            runs = (await store.listRuns({ limit: 1000 })) as Run[];
          }
          for (const run of runs) {
            toDelete.push({ run, dbPath: dp, storeIdx: i });
          }
        } finally {
          await store.close();
        }
      }

      if (toDelete.length === 0) {
        console.log('No matching runs found.');
        return;
      }

      // Show what will be deleted
      const statusEmoji: Record<string, string> = {
        completed: '✓', failed: '✗', running: '⟳', pending: '○', cancelled: '⊘',
      };
      console.log(`\nRuns to delete (${toDelete.length}):`);
      for (const { run, dbPath: dp } of toDelete) {
        const emoji = statusEmoji[run.status] ?? '?';
        const shortDb = dp.replace(process.cwd() + '/', '');
        console.log(`  ${emoji} ${run.id}  ${run.pipelineName}  ${run.startedAt}  [${shortDb}]`);
      }

      // Confirm
      if (!skipConfirm) {
        process.stdout.write(`\nDelete ${toDelete.length} run(s)? [y/N] `);
        const answer = await new Promise<string>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (d) => resolve(String(d).trim()));
        });
        if (!answer.toLowerCase().startsWith('y')) {
          console.log('Aborted.');
          return;
        }
      }

      // Delete — reopen stores
      const freshStores = await resolveAllStores(dbPath);
      let deleted = 0;

      for (const { run, storeIdx } of toDelete) {
        const { store } = freshStores[storeIdx]!;
        try {
          await store.deleteRun(run.id);
          deleted++;
        } catch {
          console.warn(`  [warn] Could not delete run ${run.id}`);
        }
      }
      for (const { store } of freshStores) {
        await store.close();
      }

      console.log(`\nDeleted ${deleted} run(s).`);
    });
}
