/**
 * RAG Document Q&A Orchestrator
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
      beforePipeline: (_p, _i, runId) => {
        console.log(`\n▶ RAG pipeline [${runId}]`);
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

    config: { projectName: 'rag-document-qa' },
  });
}

export const orchestrator = createOrchestrator();
