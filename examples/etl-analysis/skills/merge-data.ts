/**
 * Skill: merge-data
 *
 * Merges the 3 extracted datasets into a single record ready for analysis.
 * This is the T (Transform) in ETL before the Python analysis step.
 */

import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const mergeDataSkill = TransformSkill.create({
  name: 'merge-data',
  description: 'Merges sales, user, and metrics data into a unified analysis dataset',
  inputSchema: z.array(z.record(z.unknown())),
  outputSchema: z.object({
    sales: z.array(z.record(z.unknown())),
    users: z.array(z.record(z.unknown())),
    metrics: z.record(z.unknown()),
    sources: z.array(z.string()),
    totalRecords: z.number(),
  }),

  transform: (input) => {
    // Input is the raw step context — we need the parallel results
    // The pipeline passes this as an object with all parallel outputs merged
    const parallelResults = input as unknown as Array<Record<string, unknown>>;

    let sales: Array<Record<string, unknown>> = [];
    let users: Array<Record<string, unknown>> = [];
    let metrics: Record<string, unknown> = {};
    const sources: string[] = [];

    for (const result of parallelResults) {
      if ('rows' in result) {
        sales = result['rows'] as Array<Record<string, unknown>>;
        sources.push(String(result['source'] ?? 'sales'));
      } else if ('users' in result) {
        users = result['users'] as Array<Record<string, unknown>>;
        sources.push(String(result['source'] ?? 'users'));
      } else if ('metrics' in result) {
        metrics = result['metrics'] as Record<string, unknown>;
        sources.push(String(result['source'] ?? 'metrics'));
      }
    }

    return {
      sales,
      users,
      metrics,
      sources,
      totalRecords: sales.length + users.length,
    };
  },
});
