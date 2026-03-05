/**
 * Code Translation Orchestrator
 *
 * Uses SQLite state store for checkpointing — enables resume on interruption.
 */

import { Orchestrator, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';
import { sqliteStore } from '@flomatai/state-sqlite';

const dbPath = process.env['DB_PATH'] ?? '.flomatai/code-translation.db';

export const orchestrator = new Orchestrator({
  llm: { default: resolveLLMFromEnv({ temperature: 0.1, maxTokens: 4096 }) },
  state: sqliteStore(dbPath),
  hooks: {
    ...createConsoleHooks('code-translation'),
    // Override beforePipeline to also show resume hint
    beforePipeline: (_p, _i, runId) => {
      console.log(`\n▶ Code translation [${runId}]`);
      console.log(`  Checkpoint DB: ${dbPath}`);
      console.log(`  Resume with: node dist/src/run.js --resume ${runId}\n`);
    },
  },
  config: { projectName: 'code-translation' },
});
