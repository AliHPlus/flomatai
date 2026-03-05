/**
 * Code Translation Pipeline
 *
 * Discovers source files, creates a translation plan, translates each file
 * with concurrency=3, and saves output. Uses SQLite checkpointing so that
 * interrupted runs can be resumed without re-translating already-done files.
 *
 * Pipeline graph:
 *   discover-files → plan-translation
 *       ↓
 *   mapOver:files (concurrency=3, checkpointed)
 *       → translate-file
 *       ↓
 *   save-translated
 *
 * Input:  { sourceDir, sourceLanguage, targetLanguage, outputDir }
 * Output: { savedFiles, reportPath, totalLinesOfCode, warnings }
 *
 * Resuming:
 *   node dist/src/run.js --resume <run-id>
 */

import { z } from 'zod';
import { Pipeline, TransformSkill } from '@flomatai/core';
import { discoverFilesSkill } from '../skills/discover-files.js';
import { planTranslationSkill } from '../skills/plan-translation.js';
import { translateFileSkill } from '../skills/translate-file.js';
import { saveTranslatedSkill } from '../skills/save-translated.js';

// Per-file sub-pipeline: looks up the plan and translates
const translateFilePipeline = Pipeline.create('translate-single-file')
  .step('translate', translateFileSkill, {
    input: (ctx) => {
      // previousOutput is the individual file record from mapOver
      const file = ctx.previousOutput as Record<string, unknown>;
      const pipelineInput = ctx.pipelineInput as Record<string, unknown>;

      // Plan is stored in step outputs of the parent pipeline
      const plan = (pipelineInput['plan'] ?? ctx.stepOutputs['plan']) as Record<string, unknown> | undefined;

      // Find matching plan entry for this file
      const planFiles = (plan?.['files'] as Array<Record<string, unknown>>) ?? [];
      const planEntry = planFiles.find(
        (pf) => pf['sourceFile'] === file['relativePath'],
      ) ?? {};

      return {
        sourceFile: String(file['relativePath'] ?? ''),
        targetFile: String(planEntry['targetFile'] ?? file['relativePath']),
        sourceLanguage: String(pipelineInput['sourceLanguage'] ?? 'Python'),
        targetLanguage: String(pipelineInput['targetLanguage'] ?? 'TypeScript'),
        sourceCode: String(file['content'] ?? ''),
        notes: planEntry['notes'] ? String(planEntry['notes']) : undefined,
        generalNotes: plan?.['generalNotes'] ? String(plan['generalNotes']) : undefined,
      };
    },
  })
  .build();

// Prepare the mapOver source: files array from discovery + plan context injected
const prepareFilesSkill = TransformSkill.create({
  name: 'prepare-files',
  description: 'Prepares file list with plan context for translation mapOver',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    files: z.array(z.record(z.unknown())),
    plan: z.record(z.unknown()),
    sourceLanguage: z.string(),
    targetLanguage: z.string(),
    outputDir: z.string(),
  }),
  transform: (input) => {
    const inp = input as Record<string, unknown>;
    const discover = inp['discover'] as Record<string, unknown>;
    const plan = inp['plan'] as Record<string, unknown>;
    const pipelineInput = inp['pipelineInput'] as Record<string, unknown>;

    return {
      files: (discover['files'] as Array<Record<string, unknown>>) ?? [],
      plan,
      sourceLanguage: String(pipelineInput['sourceLanguage'] ?? 'Python'),
      targetLanguage: String(pipelineInput['targetLanguage'] ?? 'TypeScript'),
      outputDir: String(pipelineInput['outputDir'] ?? './output'),
    };
  },
});

export const codeTranslationPipeline = Pipeline.create('code-translation')
  .withCheckpointing()  // enables SQLite checkpoint/resume
  .input(z.object({
    sourceDir: z.string(),
    sourceLanguage: z.string(),
    targetLanguage: z.string(),
    outputDir: z.string(),
    extensions: z.array(z.string()).optional(),
  }))

  // Step 1: Discover all source files
  .step('discover', discoverFilesSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as {
        sourceDir: string;
        sourceLanguage: string;
        extensions?: string[];
      };
      const defaultExts: Record<string, string[]> = {
        Python: ['.py'],
        JavaScript: ['.js'],
        TypeScript: ['.ts'],
        Go: ['.go'],
        Java: ['.java'],
      };
      return {
        sourceDir: pi.sourceDir,
        extensions: pi.extensions ?? defaultExts[pi.sourceLanguage] ?? ['.py'],
      };
    },
  })

  // Step 2: Create translation plan
  .step('plan', planTranslationSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { sourceLanguage: string; targetLanguage: string };
      const discover = ctx.stepOutputs['discover'] as {
        files: Array<{ relativePath: string; extension: string; sizeBytes: number }>;
      };
      return {
        sourceLanguage: pi.sourceLanguage,
        targetLanguage: pi.targetLanguage,
        files: discover.files,
      };
    },
  })

  // Step 3: Translate all files (concurrency=3, skip on per-file error)
  .mapOver('files', translateFilePipeline, {
    concurrency: 3,
    onItemError: 'skip',
    name: 'translate-all-files',
  })

  // Step 4: Save translated files and generate report
  .step('save', saveTranslatedSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { targetLanguage: string; sourceLanguage: string; outputDir: string };
      return {
        outputDir: pi.outputDir,
        translations: ctx.previousOutput as Array<Record<string, unknown>>,
        sourceLanguage: pi.sourceLanguage,
        targetLanguage: pi.targetLanguage,
      };
    },
  })

  .output(z.object({
    outputDir: z.string(),
    savedFiles: z.array(z.string()),
    reportPath: z.string(),
    totalLinesOfCode: z.number(),
    warnings: z.array(z.string()),
  }))

  .build();
