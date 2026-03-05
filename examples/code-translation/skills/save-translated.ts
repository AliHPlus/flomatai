/**
 * Skill: save-translated
 *
 * Saves all translated files to the output directory and generates a migration report.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';
import type { TranslatedFile } from './translate-file.js';

export const saveTranslatedSkill = TransformSkill.create({
  name: 'save-translated',
  description: 'Saves translated files to output directory and generates migration report',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    outputDir: z.string(),
    savedFiles: z.array(z.string()),
    reportPath: z.string(),
    totalLinesOfCode: z.number(),
    warnings: z.array(z.string()),
  }),

  transform: async (input) => {
    const { outputDir, translations, sourceLanguage, targetLanguage } =
      input as {
        outputDir: string;
        translations: Array<Record<string, unknown>>;
        sourceLanguage: string;
        targetLanguage: string;
      };

    await mkdir(outputDir, { recursive: true });

    const savedFiles: string[] = [];
    const allWarnings: string[] = [];
    let totalLines = 0;

    for (const item of translations) {
      // Each item is a sub-pipeline result, unwrap the translate step
      const translated = (item['translate'] ?? item) as TranslatedFile;
      if (!translated.translatedCode) continue;

      const outputPath = join(outputDir, translated.targetFile);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, translated.translatedCode, 'utf-8');
      savedFiles.push(outputPath);
      totalLines += translated.linesOfCode ?? 0;

      if (translated.warnings?.length) {
        allWarnings.push(...translated.warnings.map((w) => `${translated.targetFile}: ${w}`));
      }
    }

    // Generate migration report
    const report = [
      `# Code Translation Report`,
      '',
      `**Source:** ${sourceLanguage}`,
      `**Target:** ${targetLanguage}`,
      `**Files translated:** ${savedFiles.length}`,
      `**Total lines of code:** ${totalLines}`,
      `**Generated:** ${new Date().toISOString()}`,
      '',
      '## Translated Files',
      '',
      ...savedFiles.map((f) => `- ${f}`),
      '',
      ...(allWarnings.length > 0 ? [
        '## Warnings (Manual Review Needed)',
        '',
        ...allWarnings.map((w) => `- ⚠️ ${w}`),
      ] : ['## No Warnings']),
    ].join('\n');

    const reportPath = join(outputDir, 'MIGRATION_REPORT.md');
    await writeFile(reportPath, report, 'utf-8');

    return {
      outputDir,
      savedFiles,
      reportPath,
      totalLinesOfCode: totalLines,
      warnings: allWarnings,
    };
  },
});
