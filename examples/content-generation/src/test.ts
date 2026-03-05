/**
 * Content Generation — test runner using MockLLMProvider.
 */

import { Orchestrator, MemoryStore, createTestLLM } from '@flomatai/core';
import { contentGenerationPipeline } from './pipeline.js';

async function runTest() {
  console.log('=== Content Generation — Test ===\n');

  const orchestrator = new Orchestrator({
    llm: { default: createTestLLM() },
    state: new MemoryStore(),
    hooks: {
      beforeStep: (step, _input, _runId) => { process.stdout.write(`  → ${step.name} ... `); },
      afterStep: (_step, record) => { console.log(`done (${record.durationMs}ms)`); },
      onError: (step, err) => { console.error(`\n  ✗ ${step?.name}: ${err.message}`); },
    },
  });

  const { output, run } = await orchestrator.run(contentGenerationPipeline, {
    topic: 'The future of AI automation',
    audience: 'developers',
    tone: 'technical',
  });

  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:  ${run.id}`);
  console.log(`  Tokens:  ${run.tokensUsed}`);
  console.log(`  Output:  ${JSON.stringify(output).substring(0, 200)}...`);

  // The output from the last non-skipped step should be the parallel results
  if (output === null || output === undefined) throw new Error('output is null');

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
