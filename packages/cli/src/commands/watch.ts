/**
 * flomatai watch — watch a running pipeline and show progress in real-time.
 *
 * Auto-discovers SQLite databases in .flomatai/ and workflows/[name]/.flomatai/.
 */

import type { Command } from 'commander';
import { resolveAllStores, resolveStore, noDbFoundError } from './db-discovery.js';

export function registerWatchCommand(program: Command, _getOrchestrator: () => unknown): void {
  program
    .command('watch [runId]')
    .description('Watch a running pipeline and show real-time progress. Use runId or watch latest.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('-i, --interval <ms>', 'Poll interval in ms', '5000')
    .action(async (runId: string | undefined, options: Record<string, string>) => {
      const dbPath = options['db'] as string | undefined;
      const interval = parseInt(options['interval'] as string, 10) || 5000;

      // If no runId, search all DBs for the most recent run
      if (!runId) {
        const allStores = await resolveAllStores(dbPath);
        if (allStores.length === 0) {
          noDbFoundError();
          process.exit(1);
        }

        type RunRef = { id: string; status: string; startedAt: string; _db: string };
        const candidates: RunRef[] = [];

        for (const { store, dbPath: dp } of allStores) {
          try {
            const runs = (await store.listRuns({ limit: 5 })) as unknown as RunRef[];
            for (const r of runs) candidates.push({ ...r, _db: dp });
          } finally {
            await store.close();
          }
        }

        if (candidates.length === 0) {
          console.log('[flomatai] No runs found.');
          process.exit(0);
        }

        // Prefer running, then most recent overall
        candidates.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        const running = candidates.find((r) => r.status === 'running');
        const chosen = running ?? candidates[0]!;
        runId = chosen.id;
        console.log(`[flomatai] Watching run: ${runId}`);
        // Pin dbPath so we poll the right store
        options['db'] = chosen._db;
      }

      // Now watch the specific run using a single resolved store
      const resolved = await resolveStore(options['db']);
      if (!resolved) {
        noDbFoundError();
        process.exit(1);
      }
      const { store } = resolved;

      const statusEmoji: Record<string, string> = {
        completed: '✓', failed: '✗', running: '⟳', pending: '○', cancelled: '⊘',
      };

      let lastStatus = '';
      let lastSteps: string[] = [];

      const printStatus = (run: {
        status: string;
        steps?: Array<{ name: string; status: string; durationMs?: number }>;
        tokensUsed?: number;
        error?: string;
      }) => {
        console.log('\x1b[2J\x1b[H');
        console.log(`\n${statusEmoji[run.status] ?? '?'} Run: ${runId}`);
        console.log(`  Status: ${run.status}`);
        if (run.tokensUsed) console.log(`  Tokens: ${run.tokensUsed}`);
        if (run.error)      console.log(`  Error:  ${run.error}`);

        if (run.steps?.length) {
          console.log('\nSteps:');
          for (const step of run.steps) {
            const emoji = statusEmoji[step.status] ?? '?';
            console.log(`  ${emoji} ${step.name} (${step.durationMs ?? '?'}ms)`);
          }
        }
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const run = await store.getRun(runId!) as {
            status: string;
            steps?: Array<{ name: string; status: string; durationMs?: number }>;
            tokensUsed?: number;
            error?: string;
          } | null;

          if (!run) {
            console.error(`[flomatai] Run not found: ${runId}`);
            break;
          }

          const currentStatus = run.status;
          const currentSteps = run.steps?.map((s) => `${s.name}:${s.status}`) ?? [];

          if (currentStatus !== lastStatus || JSON.stringify(currentSteps) !== JSON.stringify(lastSteps)) {
            printStatus(run);
            lastStatus = currentStatus;
            lastSteps = currentSteps;
          }

          if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
            console.log(`\n[flomatai] Run ${currentStatus}. Exiting.`);
            break;
          }

          await new Promise((r) => setTimeout(r, interval));
        } catch (e) {
          console.error('[flomatai] Error watching:', e);
          break;
        }
      }

      await store.close();
      process.exit(0);
    });
}
