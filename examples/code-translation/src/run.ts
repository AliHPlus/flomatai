/**
 * Code Translation Pipeline — runner script.
 *
 * Usage:
 *   # Translate Python to TypeScript (using bundled sample project):
 *   node dist/src/run.js --source ./sample-project --from Python --to TypeScript --output ./translated
 *
 *   # Translate your own project:
 *   node dist/src/run.js --source ./my-app --from Python --to TypeScript --output ./my-app-ts
 *
 *   # Resume an interrupted run:
 *   node dist/src/run.js --resume <run-id>
 */

import { getArg } from '@flomatai/core';
import { codeTranslationPipeline } from './pipeline.js';
import { orchestrator } from './orchestrator.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT = join(__dirname, '../sample-project');

async function main() {
  const resumeId = getArg('--resume') ?? process.env['RESUME'];

  const sourceDir = getArg('--source') ?? process.env['SOURCE_DIR'] ?? SAMPLE_PROJECT;
  const sourceLanguage = getArg('--from') ?? process.env['SOURCE_LANG'] ?? 'Python';
  const targetLanguage = getArg('--to') ?? process.env['TARGET_LANG'] ?? 'TypeScript';
  const outputDir = getArg('--output') ?? process.env['OUTPUT_DIR'] ?? './translated';

  console.log('\nCode Translation Pipeline');
  console.log(`  Source: ${sourceDir} (${sourceLanguage})`);
  console.log(`  Target: ${outputDir} (${targetLanguage})`);
  if (resumeId) console.log(`  Resuming run: ${resumeId}`);

  try {
    const { output, run } = await orchestrator.run(
      codeTranslationPipeline,
      { sourceDir, sourceLanguage, targetLanguage, outputDir },
      resumeId ? { runId: resumeId } : undefined,
    );

    const result = output as {
      outputDir: string;
      savedFiles: string[];
      reportPath: string;
      totalLinesOfCode: number;
      warnings: string[];
    };

    console.log('\n── Translation Complete ────────────────────────────────');
    console.log(`  Files translated:  ${result.savedFiles.length}`);
    console.log(`  Lines of code:     ${result.totalLinesOfCode}`);
    console.log(`  Output directory:  ${result.outputDir}`);
    console.log(`  Migration report:  ${result.reportPath}`);
    if (result.warnings.length > 0) {
      console.log(`  Warnings:          ${result.warnings.length} (see report)`);
    }
    console.log(`  Run ID:            ${run.id}`);
    console.log('────────────────────────────────────────────────────────');
  } catch (err) {
    console.error('\nPipeline failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
