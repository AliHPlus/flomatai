/**
 * flomatai inspect <runId> — view a run's details, trace, and step outputs.
 */

import type { Command } from 'commander';
import { existsSync } from 'fs';
import { sqliteStore } from '@flomatai/state-sqlite';

async function getStateStore(dbPath?: string): Promise<{ getRun: (id: string) => Promise<unknown> } | null> {
  if (dbPath && existsSync(dbPath)) {
    const store = sqliteStore(dbPath);
    await store.init();
    return store;
  }

  // Auto-detect database in .flomatai/ directory
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

export function registerInspectCommand(program: Command, getOrchestrator: () => unknown): void {
  program
    .command('inspect <runId>')
    .description('Inspect a pipeline run — show status, steps, token usage, and output.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('--output', 'Print the full output JSON')
    .option('--steps', 'Print step-by-step details')
    .option('--step-output <stepName>', 'Print output for a specific step')
    .action(async (runId: string, options: Record<string, string | boolean>) => {
      const dbPath = options['db'] as string | undefined;
      const state = await getStateStore(dbPath);

      if (!state) {
        console.error('[flomatai] No state database found. Specify --db or run from a project directory.');
        process.exit(1);
      }

      const run = await state.getRun(runId) as {
        id: string;
        pipelineName: string;
        status: string;
        startedAt: string;
        completedAt?: string;
        durationMs?: number;
        tokensUsed: number;
        error?: string;
        steps?: Array<{
          name: string;
          status: string;
          durationMs?: number;
          attempt: number;
          error?: string;
          output?: unknown;
        }>;
        output?: unknown;
      } | null;

      if (!run) {
        console.error(`[flomatai] Run not found: ${runId}`);
        process.exit(1);
      }

      const statusEmoji: Record<string, string> = {
        completed: '✓',
        failed: '✗',
        running: '⟳',
        pending: '○',
        cancelled: '⊘',
      };

      console.log(`\n${statusEmoji[run.status] ?? '?'} Run: ${run.id}`);
      console.log(`  Pipeline:  ${run.pipelineName}`);
      console.log(`  Status:    ${run.status}`);
      console.log(`  Started:   ${run.startedAt}`);
      if (run.completedAt) console.log(`  Completed: ${run.completedAt}`);
      if (run.durationMs) console.log(`  Duration:  ${run.durationMs}ms`);
      console.log(`  Tokens:    ${run.tokensUsed}`);
      if (run.error) console.log(`  Error:     ${run.error}`);

      // Show specific step output
      const stepName = options['stepOutput'] as string | undefined;
      if (stepName && run.steps && run.steps.length) {
        const step = run.steps.find((s) => s.name === stepName);
        if (step) {
          console.log(`\n--- Step: ${stepName} ---`);
          console.log(JSON.stringify(step.output ?? '(no output)', null, 2));
        } else {
          console.log(`[flomatai] Step not found: ${stepName}`);
        }
      }

      if (options['steps'] && run.steps && run.steps.length > 0) {
        console.log('\nSteps:');
        for (const step of run.steps) {
          const emoji = statusEmoji[step.status] ?? '?';
          console.log(`  ${emoji} ${step.name} (${step.durationMs ?? '?'}ms, attempt ${step.attempt})`);
          if (step.error) console.log(`      Error: ${step.error}`);
        }
      }

      if (options['output'] && run.output !== undefined) {
        console.log('\nOutput:');
        console.log(JSON.stringify(run.output, null, 2));
      }

      // Auto-close if we created a store
      if (state && 'close' in state) {
        await (state as { close: () => Promise<void> }).close();
      }
    });
}
