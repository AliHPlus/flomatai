/**
 * ETL + Python Analysis Pipeline
 *
 * Extracts data from 3 sources in parallel, merges them, runs Python
 * statistical analysis, then generates an LLM executive narrative report.
 *
 * Pipeline graph:
 *   parallel:
 *     ├── extract-sales  (CSV file)
 *     ├── extract-users  (JSON file)
 *     └── extract-metrics (JSON file)
 *       ↓
 *   merge-data
 *       ↓
 *   analyze-python (Python bridge — no pandas required, pure stdlib)
 *       ↓
 *   generate-narrative (LLM)
 *
 * Input:  { salesCsv, usersJson, metricsJson, period? }
 * Output: { executiveSummary, salesHighlights, userHighlights, systemHighlights, recommendations, riskFlags }
 */

import { z } from 'zod';
import { Pipeline, TransformSkill } from '@flomatai/core';
import { extractSalesSkill } from '../skills/extract-sales.js';
import { extractUsersSkill } from '../skills/extract-users.js';
import { extractMetricsSkill } from '../skills/extract-metrics.js';
import { mergeDataSkill } from '../skills/merge-data.js';
import { analyzePythonSkill } from '../skills/analyze-python.js';
import { generateNarrativeSkill } from '../skills/generate-narrative.js';

// Sub-pipelines for each data source (used in parallel step)
const salesPipeline = Pipeline.create('extract-sales-pipeline')
  .step('extract', extractSalesSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { salesCsv: string };
      return { filePath: pi.salesCsv };
    },
  })
  .build();

const usersPipeline = Pipeline.create('extract-users-pipeline')
  .step('extract', extractUsersSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { usersJson: string };
      return { filePath: pi.usersJson };
    },
  })
  .build();

const metricsPipeline = Pipeline.create('extract-metrics-pipeline')
  .step('extract', extractMetricsSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { metricsJson: string };
      return { filePath: pi.metricsJson };
    },
  })
  .build();

// Adapter: unwrap parallel results before merge
const unwrapParallelSkill = TransformSkill.create({
  name: 'unwrap-parallel',
  description: 'Unwraps parallel step results for the merge step',
  inputSchema: z.array(z.record(z.unknown())),
  outputSchema: z.array(z.record(z.unknown())),
  transform: (input) => {
    // Each parallel branch returns { stepName: output }
    // We need to flatten to get the actual extracted data
    return (input as Array<Record<string, unknown>>).map((branch) => {
      // Each branch has one step named 'extract'
      return (branch['extract'] ?? branch) as Record<string, unknown>;
    });
  },
});

export const etlAnalysisPipeline = Pipeline.create('etl-analysis')
  .input(z.object({
    salesCsv: z.string(),
    usersJson: z.string(),
    metricsJson: z.string(),
    period: z.string().optional(),
  }))

  // Step 1: Extract all 3 data sources in parallel
  .parallel([salesPipeline, usersPipeline, metricsPipeline], 'extract-all')

  // Step 2: Unwrap parallel branch outputs
  .step('unwrap', unwrapParallelSkill, {
    input: (ctx) => ctx.previousOutput,
  })

  // Step 3: Merge into unified dataset
  .step('merge', mergeDataSkill, {
    input: (ctx) => ctx.previousOutput,
  })

  // Step 4: Python statistical analysis
  .step('analyze', analyzePythonSkill, {
    input: (ctx) => ctx.previousOutput,
  })

  // Step 5: LLM narrative report
  .step('narrative', generateNarrativeSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { period?: string };
      return {
        analysis: ctx.previousOutput,
        period: pi.period,
      };
    },
  })

  .output(z.object({
    executiveSummary: z.string(),
    salesHighlights: z.string(),
    userHighlights: z.string(),
    systemHighlights: z.string(),
    recommendations: z.array(z.string()),
    riskFlags: z.array(z.string()),
  }))

  .build();
