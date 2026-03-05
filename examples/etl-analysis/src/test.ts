/**
 * ETL Analysis — test runner using MockLLMProvider + real Python bridge.
 */

import { Orchestrator, MemoryStore, createTestLLM } from '@flomatai/core';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { etlAnalysisPipeline } from './pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

async function runTest() {
  console.log('=== ETL Analysis — Test ===\n');

  const orchestrator = new Orchestrator({
    llm: { default: createTestLLM() },
    state: new MemoryStore(),
    hooks: {
      beforeStep: (step, _input, _runId) => { process.stdout.write(`  → ${step.name} ... `); },
      afterStep: (_step, record) => { console.log(`done (${record.durationMs}ms)`); },
      onError: (step, err) => { console.error(`\n  ✗ ${step?.name}: ${err.message}`); },
    },
  });

  const { output, run } = await orchestrator.run(etlAnalysisPipeline, {
    salesCsv: join(DATA_DIR, 'sales.csv'),
    usersJson: join(DATA_DIR, 'users.json'),
    metricsJson: join(DATA_DIR, 'metrics.json'),
    period: 'Q1 2024',
  });

  const result = output as {
    executiveSummary: string;
    salesHighlights: string;
    userHighlights: string;
    systemHighlights: string;
    recommendations: string[];
    riskFlags: string[];
  };

  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:   ${run.id}`);
  console.log(`  Tokens:   ${run.tokensUsed}`);
  console.log(`  Summary:  ${result.executiveSummary?.substring(0, 100)}...`);
  console.log(`  Recs:     ${result.recommendations?.length} recommendations`);

  if (!result.executiveSummary) throw new Error('executiveSummary is empty');

  console.log('\n✅ All assertions passed');
  // Force exit — the Python bridge keeps a subprocess alive that prevents natural exit
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
