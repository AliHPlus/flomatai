/**
 * Social Monitoring Orchestrator
 */

import { Orchestrator, MemoryStore, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';

export const orchestrator = new Orchestrator({
  llm: { default: resolveLLMFromEnv({ temperature: 0.2, maxTokens: 1024 }) },
  state: new MemoryStore(),
  hooks: createConsoleHooks('social-monitoring'),
  config: { projectName: 'social-monitoring' },
});
