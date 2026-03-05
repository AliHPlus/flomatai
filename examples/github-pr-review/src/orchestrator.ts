/**
 * GitHub PR Review Orchestrator
 *
 * Configures the LLM provider and state store for the PR review pipeline.
 * Supports Anthropic (default) or OpenCode (local proxy) via env vars.
 */

import { Orchestrator, MemoryStore } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { openCode } from '@flomatai/provider-openai-compat';

export function createOrchestrator(): Orchestrator {
  const useOpenCode = process.env['OPENCODE_BASE_URL'] || process.env['USE_OPENCODE'];

  const llm = useOpenCode
    ? openCode({ model: process.env['LLM_MODEL'] ?? 'anthropic/claude-sonnet-4-6' })
    : anthropic({
        model: process.env['LLM_MODEL'] ?? 'claude-3-5-sonnet-20241022',
        temperature: 0.1,
        maxTokens: 2048,
      });

  return new Orchestrator({
    llm: { default: llm },
    state: new MemoryStore(),

    hooks: {
      beforePipeline: (_pipeline, _input, runId) => {
        console.log(`\n▶ Starting PR review [${runId}]`);
      },
      afterPipeline: (_pipeline, run) => {
        const icon = run.status === 'completed' ? '✓' : '✗';
        console.log(`\n${icon} Review ${run.status} in ${run.durationMs}ms (${run.tokensUsed} tokens)`);
      },
      beforeStep: (step) => {
        process.stdout.write(`  → ${step.name} ... `);
      },
      afterStep: (step, record) => {
        console.log(`done (${record.durationMs}ms)`);
      },
      onError: (step, error) => {
        console.error(`\n  ✗ ${step?.name ?? 'pipeline'}: ${error.message}`);
      },
    },

    config: { projectName: 'github-pr-review' },
  });
}

export const orchestrator = createOrchestrator();
