/**
 * flomatai inspect <runId> — view a run's details, trace, and step outputs.
 */

import type { Command } from 'commander';
import type { Orchestrator } from '@flomatai/core';

export function registerInspectCommand(program: Command, getOrchestrator: () => Orchestrator): void {
  program
    .command('inspect <runId>')
    .description('Inspect a pipeline run — show status, steps, token usage, and output.')
    .option('--output', 'Print the full output JSON')
    .option('--steps', 'Print step-by-step details')
    .action(async (runId: string, options: Record<string, boolean>) => {
      const orchestrator = getOrchestrator();
      const run = await orchestrator.stateStore.getRun(runId);

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

      if (options['steps'] && run.steps?.length > 0) {
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
