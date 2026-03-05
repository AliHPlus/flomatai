/**
 * orchestrator-helpers — convenience factories for common Orchestrator configuration.
 *
 * Extracted from the repeated boilerplate found in every example's orchestrator.ts.
 * Import these instead of writing the hooks object by hand.
 */

import type { OrchestratorHooks } from './orchestrator.js';

/**
 * Returns the standard console-logging hooks used by all flomatai examples.
 *
 * Output format:
 *   ▶ <label> [<runId>]
 *     → step-name ... done (42ms)
 *   ✓ completed in 1234ms (567 tokens)
 *
 * @param label  Short description shown in the beforePipeline line (e.g. 'verlivo-planning').
 *               Defaults to 'Pipeline'.
 */
export function createConsoleHooks(label?: string): OrchestratorHooks {
  return {
    beforePipeline: (_pipeline, _input, runId) => {
      console.log(`\n▶ ${label ?? 'Pipeline'} [${runId}]`);
    },
    afterPipeline: (_pipeline, run) => {
      const icon = run.status === 'completed' ? '✓' : '✗';
      console.log(`\n${icon} ${run.status} in ${run.durationMs}ms (${run.tokensUsed} tokens)`);
    },
    beforeStep: (step) => {
      process.stdout.write(`  → ${step.name} ... `);
    },
    afterStep: (_step, record) => {
      console.log(`done (${record.durationMs}ms)`);
    },
    onError: (step, error) => {
      console.error(`\n  ✗ ${step?.name ?? 'pipeline'}: ${error.message}`);
    },
  };
}
