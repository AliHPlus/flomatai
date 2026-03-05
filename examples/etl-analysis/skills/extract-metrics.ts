/**
 * Skill: extract-metrics
 *
 * Extracts system metrics from a JSON file (or uses bundled synthetic data).
 * In a real scenario this would call an API (Datadog, CloudWatch, etc.).
 */

import { readFile } from 'fs/promises';
import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const extractMetricsSkill = TransformSkill.create({
  name: 'extract-metrics',
  description: 'Extracts system metrics data (API calls, latency, growth)',
  inputSchema: z.object({
    filePath: z.string(),
  }),
  outputSchema: z.object({
    metrics: z.record(z.unknown()),
    source: z.string(),
  }),

  transform: async (input) => {
    const text = await readFile(input.filePath, 'utf-8');
    const metrics = JSON.parse(text) as Record<string, unknown>;
    return { metrics, source: input.filePath };
  },
});
