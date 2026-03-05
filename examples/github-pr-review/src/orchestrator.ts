/**
 * GitHub PR Review Orchestrator
 *
 * Configures the LLM provider and state store for the PR review pipeline.
 * Supports Anthropic (default) or OpenCode (local proxy) via env vars.
 */

import { Orchestrator, MemoryStore, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';

export const orchestrator = new Orchestrator({
  llm: { default: resolveLLMFromEnv({ temperature: 0.1, maxTokens: 2048 }) },
  state: new MemoryStore(),
  hooks: createConsoleHooks('github-pr-review'),
  config: { projectName: 'github-pr-review' },
});
