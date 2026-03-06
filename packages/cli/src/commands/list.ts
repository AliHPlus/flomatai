/**
 * flomatai list — list recent pipeline runs.
 */

import type { Command } from 'commander';
import { existsSync } from 'fs';
import { sqliteStore } from '@flomatai/state-sqlite';

async function getStateStore(dbPath?: string): Promise<{ listRuns: (filter?: { pipelineName?: string; status?: string; limit?: number }) => Promise<unknown[]>; close: () => Promise<void> } | null> {
  if (dbPath && existsSync(dbPath)) {
    const store = sqliteStore(dbPath);
    await store.init();
    return store;
  }

  const autoPaths = [
    '.flomatai/verlivo.db',
    '.flomatai/verlivo-impl.db',
    '.flomatai/state.db',
  ];
  for (const p of autoPaths) {
    if (existsSync(p)) {
      const store = sqliteStore(p);
      await store.init();
      return store;
    }
  }
  return null;
}

export function registerListCommand(program: Command, _getOrchestrator: () => unknown): void {
  program
    .command('list')
    .description('List recent pipeline runs.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('-n, --pipeline <name>', 'Filter by pipeline name')
    .option('-s, --status <status>', 'Filter by status (completed|failed|running|pending)')
    .option('-l, --limit <n>', 'Max results (default: 20)', '20')
    .action(async (options: Record<string, string>) => {
      const dbPath = options['db'] as string | undefined;
      const state = await getStateStore(dbPath);

      if (!state) {
        console.error('[flomatai] No state database found. Specify --db or run from a project directory.');
        process.exit(1);
      }

      const runs = await state.listRuns({
        pipelineName: options['pipeline'],
        status: options['status'],
        limit: parseInt(options['limit'] ?? '20'),
      }) as Array<{ id: string; pipelineName: string; status: string; startedAt: string; tokensUsed: number }>;

      if (runs.length === 0) {
        console.log('No runs found.');
        await state.close();
        return;
      }

      const pad = (s: string, n: number) => s.substring(0, n).padEnd(n);
      const statusEmoji: Record<string, string> = {
        completed: '✓', failed: '✗', running: '⟳', pending: '○', cancelled: '⊘',
      };

      console.log(`\n${pad('STATUS', 4)} ${pad('RUN ID', 38)} ${pad('PIPELINE', 30)} ${pad('STARTED', 24)} TOKENS`);
      console.log('─'.repeat(110));

      for (const run of runs) {
        const emoji = statusEmoji[run.status] ?? '?';
        console.log(
          `${emoji}    ${pad(run.id, 38)} ${pad(run.pipelineName, 30)} ${pad(run.startedAt, 24)} ${run.tokensUsed}`,
        );
      }

      console.log(`\n${runs.length} run(s) shown.`);
      await state.close();
    });
}
