/**
 * flomatai watch — watch a running pipeline and show progress in real-time.
 */

import type { Command } from 'commander';
import { existsSync } from 'fs';
import { sqliteStore } from '@flomatai/state-sqlite';

async function getStateStore(dbPath?: string): Promise<{
  getRun: (id: string) => Promise<unknown>;
  listRuns: (filter?: { limit?: number }) => Promise<unknown[]>;
  close: () => Promise<void>;
} | null> {
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

export function registerWatchCommand(program: Command, _getOrchestrator: () => unknown): void {
  program
    .command('watch [runId]')
    .description('Watch a running pipeline and show real-time progress. Use runId or watch latest.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('-i, --interval <ms>', 'Poll interval in ms', '5000')
    .action(async (runId: string | undefined, options: Record<string, string>) => {
      const dbPath = options['db'] as string | undefined;
      const interval = parseInt(options['interval'] as string, 10) || 5000;

      const state = await getStateStore(dbPath);
      if (!state) {
        console.error('[flomatai] No state database found. Specify --db or run from a project directory.');
        process.exit(1);
      }

      // If no runId provided, find the latest running or most recent
      if (!runId) {
        const runs = await (state as { listRuns: (filter?: unknown) => Promise<unknown[]> }).listRuns?.({}) as Array<{ id: string; status: string }> | undefined;
        if (!runs || runs.length === 0) {
          console.log('[flomatai] No runs found.');
          process.exit(0);
        }
        // Find most recent running, or fall back to most recent
        const running = runs.find((r) => r.status === 'running');
        runId = running?.id ?? runs[0]!.id;
        console.log(`[flomatai] Watching latest run: ${runId}`);
      }

      const statusEmoji: Record<string, string> = {
        completed: '✓',
        failed: '✗',
        running: '⟳',
        pending: '○',
        cancelled: '⊘',
      };

      let lastStatus = '';
      let lastSteps: string[] = [];

      const printStatus = (run: {
        status: string;
        steps?: Array<{ name: string; status: string; durationMs?: number }>;
        tokensUsed?: number;
        error?: string;
      }) => {
        // Clear previous output if possible
        console.log('\x1b[2J\x1b[H');
        console.log(`\n${statusEmoji[run.status] ?? '?'} Run: ${runId}`);
        console.log(`  Status: ${run.status}`);
        if (run.tokensUsed) console.log(`  Tokens: ${run.tokensUsed}`);
        if (run.error) console.log(`  Error:  ${run.error}`);

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
          const run = await state.getRun(runId!) as {
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

          // Only print if status changed or steps changed
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

      await state.close();
      process.exit(0);
    });
}
