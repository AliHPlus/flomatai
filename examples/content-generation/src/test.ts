/**
 * Content Generation — test runner using MockLLMProvider.
 */

import { createTestOrchestrator } from '@flomatai/core';
import { contentGenerationPipeline } from './pipeline.js';

async function runTest() {
  console.log('=== Content Generation — Test ===\n');

  const orchestrator = createTestOrchestrator();
  const { output, run } = await orchestrator.run(contentGenerationPipeline, {
    topic: 'The future of AI automation',
    audience: 'developers',
    tone: 'technical',
  });

  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:  ${run.id}`);
  console.log(`  Tokens:  ${run.tokensUsed}`);
  console.log(`  Output:  ${JSON.stringify(output).substring(0, 200)}...`);

  if (output === null || output === undefined) throw new Error('output is null');

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
