/**
 * Content Generation Orchestrator
 */

import { Orchestrator, MemoryStore, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';

export const orchestrator = new Orchestrator({
  llm: { default: resolveLLMFromEnv({ temperature: 0.5, maxTokens: 3000 }) },
  state: new MemoryStore(),
  hooks: createConsoleHooks('content-generation'),
  config: { projectName: 'content-generation' },
});
