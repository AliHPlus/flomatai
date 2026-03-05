/**
 * Test for hello-pipeline.
 */

import { createTestOrchestrator } from '@flomatai/core';
import { pipeline } from './pipeline.js';

async function test() {
  console.log('=== Hello Pipeline Test ===\n');

  // Test pipeline
  const orchestrator = createTestOrchestrator();

  const { output, run } = await orchestrator.run<{ message: string }>(pipeline, { name: 'FlomatAI' });

  console.log('Pipeline output:', JSON.stringify(output, null, 2));
  console.log('\nTokens used:', run.tokensUsed);
  console.log('Duration:', run.durationMs, 'ms');

  if (output.message === 'Hello, FlomatAI!') {
    console.log('\n✅ Test passed!');
  } else {
    console.log('\n❌ Test failed - unexpected output');
    console.log('Expected: "Hello, FlomatAI!"');
    console.log('Got:', output.message);
    process.exit(1);
  }
}

test().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
