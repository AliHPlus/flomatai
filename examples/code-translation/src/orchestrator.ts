/**
 * Code Translation Orchestrator
 *
 * Uses SQLite state store for checkpointing — enables resume on interruption.
 */

import { Orchestrator } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { openCode } from '@flomatai/provider-openai-compat';
import { sqliteStore } from '@flomatai/state-sqlite';

export function createOrchestrator(): Orchestrator {
  const useOpenCode = process.env['OPENCODE_BASE_URL'] || process.env['USE_OPENCODE'];
  const dbPath = process.env['DB_PATH'] ?? '.flomatai/code-translation.db';

  const llm = useOpenCode
    ? openCode({ model: process.env['LLM_MODEL'] ?? 'anthropic/claude-sonnet-4-6' })
    : anthropic({
        model: process.env['LLM_MODEL'] ?? 'claude-3-5-sonnet-20241022',
        temperature: 0.1,
        maxTokens: 4096,
      });

  return new Orchestrator({
    llm: { default: llm },

    // SQLite enables checkpointing → resume interrupted runs
    state: sqliteStore(dbPath),

    hooks: {
      beforePipeline: (_p, _i, runId) => {
        console.log(`\n▶ Code translation [${runId}]`);
        console.log(`  Checkpoint DB: ${dbPath}`);
        console.log(`  Resume with: node dist/src/run.js --resume ${runId}\n`);
      },
      afterPipeline: (_p, run) => {
        const icon = run.status === 'completed' ? '✓' : '✗';
        console.log(`\n${icon} Done in ${run.durationMs}ms (${run.tokensUsed} tokens)`);
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
    },

    config: { projectName: 'code-translation' },
  });
}

export const orchestrator = createOrchestrator();
