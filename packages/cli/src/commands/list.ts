/**
 * flomatai list — list recent pipeline runs.
 */

import type { Command } from 'commander';
import type { Orchestrator } from '@flomatai/core';

export function registerListCommand(program: Command, getOrchestrator: () => Orchestrator): void {
  program
    .command('list')
    .description('List recent pipeline runs.')
    .option('-n, --pipeline <name>', 'Filter by pipeline name')
    .option('-s, --status <status>', 'Filter by status (completed|failed|running|pending)')
    .option('-l, --limit <n>', 'Max results (default: 20)', '20')
    .action(async (options: Record<string, string>) => {
      const orchestrator = getOrchestrator();
      const runs = await orchestrator.stateStore.listRuns({
        pipelineName: options['pipeline'],
        status: options['status'],
        limit: parseInt(options['limit'] ?? '20'),
      });

      if (runs.length === 0) {
        console.log('No runs found.');
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
    });
}
