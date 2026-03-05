/**
 * RAG Document Q&A — test runner using MockLLMProvider.
 *
 * Tests the full pipeline: ingest → retrieve → generate-answer
 * using real TF-IDF (no LLM) for ingest/retrieve, mock LLM for answer.
 */

import { Orchestrator, MemoryStore, createTestLLM } from '@flomatai/core';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ragPipeline } from './pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is dist/src/ after compilation; go up two levels to reach package root
const SAMPLE_DOCS = join(__dirname, '../../sample-docs');

async function runTest() {
  console.log('=== RAG Document Q&A — Test ===\n');

  const orchestrator = new Orchestrator({
    llm: { default: createTestLLM() },
    state: new MemoryStore(),
    hooks: {
      beforeStep: (step, _input, _runId) => { process.stdout.write(`  → ${step.name} ... `); },
      afterStep: (_step, record) => { console.log(`done (${record.durationMs}ms)`); },
      onError: (step, err) => { console.error(`\n  ✗ ${step?.name}: ${err.message}`); },
    },
  });

  const { output, run } = await orchestrator.run(ragPipeline, {
    paths: [SAMPLE_DOCS],
    query: 'What is type inference in TypeScript?',
    topK: 3,
  });

  const result = output as { answer: string; citations: unknown[]; confidence: string };
  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:     ${run.id}`);
  console.log(`  Tokens:     ${run.tokensUsed}`);
  console.log(`  Answer:     ${result.answer.substring(0, 100)}...`);
  console.log(`  Citations:  ${result.citations.length}`);
  console.log(`  Confidence: ${result.confidence}`);

  // Assertions
  if (!result.answer) throw new Error('answer is empty');
  if (typeof result.confidence !== 'string') throw new Error('confidence missing');

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
