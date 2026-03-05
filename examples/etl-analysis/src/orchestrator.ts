/**
 * ETL Analysis Orchestrator
 */

import { Orchestrator, MemoryStore, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';

export const orchestrator = new Orchestrator({
  llm: { default: resolveLLMFromEnv({ temperature: 0.2, maxTokens: 2048 }) },
  state: new MemoryStore(),
  hooks: createConsoleHooks('etl-analysis'),
  config: { projectName: 'etl-analysis' },
});
