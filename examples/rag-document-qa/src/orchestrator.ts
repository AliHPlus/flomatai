/**
 * RAG Document Q&A Orchestrator
 */

import { Orchestrator, MemoryStore, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';

export const orchestrator = new Orchestrator({
  llm: { default: resolveLLMFromEnv({ temperature: 0.1, maxTokens: 2048 }) },
  state: new MemoryStore(),
  hooks: createConsoleHooks('rag-document-qa'),
  config: { projectName: 'rag-document-qa' },
});
