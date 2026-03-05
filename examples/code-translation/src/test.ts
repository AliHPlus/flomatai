/**
 * Code Translation — test runner using MockLLMProvider.
 */

import { createTestOrchestrator } from '@flomatai/core';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { codeTranslationPipeline } from './pipeline.js';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT = join(__dirname, '../../sample-project');

async function runTest() {
  console.log('=== Code Translation — Test ===\n');

  const outputDir = await mkdtemp(join(tmpdir(), 'flomatai-test-'));
  const orchestrator = createTestOrchestrator();

  const { output, run } = await orchestrator.run(codeTranslationPipeline, {
    sourceDir: SAMPLE_PROJECT,
    sourceLanguage: 'Python',
    targetLanguage: 'TypeScript',
    outputDir,
  });

  const result = output as {
    outputDir: string;
    savedFiles: string[];
    reportPath: string;
    totalLinesOfCode: number;
    warnings: string[];
  };

  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:     ${run.id}`);
  console.log(`  Files:      ${result.savedFiles?.length}`);
  console.log(`  Output dir: ${result.outputDir}`);
  console.log(`  Report:     ${result.reportPath}`);
  console.log(`  Lines:      ${result.totalLinesOfCode}`);

  if (!result.savedFiles || result.savedFiles.length === 0) {
    throw new Error('no files were translated');
  }

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
