/**
 * flomatai inspect <runId> — view a run's details, trace, and step outputs.
 *
 * Auto-discovers SQLite databases in .flomatai/ and workflows/[name]/.flomatai/.
 * Searches all discovered DBs for the given run ID.
 */

import type { Command } from 'commander';
import { resolveAllStores, noDbFoundError } from './db-discovery.js';

export function registerInspectCommand(program: Command, _getOrchestrator: () => unknown): void {
  program
    .command('inspect <runId>')
    .description('Inspect a pipeline run — show status, steps, token usage, and output.')
    .option('-d, --db <path>', 'Path to SQLite database (auto-detected if not provided)')
    .option('--output', 'Print the full output JSON')
    .option('--steps', 'Print step-by-step details')
    .option('--step-output <stepName>', 'Print output for a specific step')
    .action(async (runId: string, options: Record<string, string | boolean>) => {
      const dbPath = options['db'] as string | undefined;
      const stores = await resolveAllStores(dbPath);

      if (stores.length === 0) {
        noDbFoundError();
        process.exit(1);
      }

      type RunRecord = {
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
      };

      let run: RunRecord | null = null;

      for (const { store } of stores) {
        try {
          // Exact match first
          let found = await store.getRun(runId) as RunRecord | null;
          // Prefix match fallback (handles truncated IDs from list output)
          if (!found) {
            const all = await store.listRuns({ limit: 200 }) as RunRecord[];
            const matches = all.filter((r) => r.id.startsWith(runId));
            if (matches.length === 1) {
              found = await store.getRun(matches[0]!.id) as RunRecord | null;
            } else if (matches.length > 1) {
              console.error(`[flomatai] Ambiguous prefix '${runId}' matches ${matches.length} runs:`);
              matches.forEach((r) => console.error(`  ${r.id}`));
              process.exit(1);
            }
          }
          if (found) { run = found; break; }
        } finally {
          await store.close();
        }
      }

      if (!run) {
        console.error(`[flomatai] Run not found: ${runId}`);
        process.exit(1);
      }

      const statusEmoji: Record<string, string> = {
        completed: '✓', failed: '✗', running: '⟳', pending: '○', cancelled: '⊘',
      };

      console.log(`\n${statusEmoji[run.status] ?? '?'} Run: ${run.id}`);
      console.log(`  Pipeline:  ${run.pipelineName}`);
      console.log(`  Status:    ${run.status}`);
      console.log(`  Started:   ${run.startedAt}`);
      if (run.completedAt) console.log(`  Completed: ${run.completedAt}`);
      if (run.durationMs)  console.log(`  Duration:  ${run.durationMs}ms`);
      console.log(`  Tokens:    ${run.tokensUsed}`);
      if (run.error)       console.log(`  Error:     ${run.error}`);

      // Show specific step output
      const stepName = options['stepOutput'] as string | undefined;
      if (stepName && run.steps?.length) {
        const step = run.steps.find((s) => s.name === stepName);
        if (step) {
          console.log(`\n--- Step: ${stepName} ---`);
          console.log(JSON.stringify(step.output ?? '(no output)', null, 2));
        } else {
          console.log(`[flomatai] Step not found: ${stepName}`);
          console.log(`  Available steps: ${run.steps.map((s) => s.name).join(', ')}`);
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
    });
}
