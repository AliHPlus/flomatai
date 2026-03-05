/**
 * Skill: analyze-python
 *
 * Runs the Python pandas analysis script via the flomatai Python bridge.
 * Takes the merged ETL dataset and returns computed statistics.
 */

import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PythonSkill } from '@flomatai/bridge-python';

const __dirname = dirname(fileURLToPath(import.meta.url));
// TypeScript compiles to dist/skills/, so go up two levels to reach the project root
const SCRIPT_PATH = join(__dirname, '../../python/analyze.py');

export const analyzePythonSkill = PythonSkill.create({
  name: 'analyze-python',
  description: 'Runs Python statistical analysis on merged ETL data using pandas-style aggregations',
  script: SCRIPT_PATH,
  function: 'analyze',
  pythonPath: process.env['PYTHON_PATH'] ?? 'python3',
  timeout: 30_000,

  inputSchema: z.object({
    sales: z.array(z.record(z.unknown())),
    users: z.array(z.record(z.unknown())),
    metrics: z.record(z.unknown()),
    sources: z.array(z.string()).optional(),
    totalRecords: z.number().optional(),
  }),

  outputSchema: z.object({
    sales: z.record(z.unknown()),
    users: z.record(z.unknown()),
    system: z.record(z.unknown()),
    summary: z.record(z.unknown()),
  }),

  tags: ['python', 'analytics', 'etl'],
});
