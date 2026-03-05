/**
 * Skill: extract-sales
 *
 * Extracts sales data from a CSV file (or uses bundled synthetic data).
 * Parses CSV rows into structured records.
 */

import { readFile } from 'fs/promises';
import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

const SaleRowSchema = z.object({
  date: z.string(),
  product: z.string(),
  region: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  revenue: z.number(),
  salesperson_id: z.string(),
});

export type SaleRow = z.infer<typeof SaleRowSchema>;

export const extractSalesSkill = TransformSkill.create({
  name: 'extract-sales',
  description: 'Extracts and parses sales CSV data',
  inputSchema: z.object({
    filePath: z.string(),
  }),
  outputSchema: z.object({
    rows: z.array(SaleRowSchema),
    source: z.string(),
    rowCount: z.number(),
  }),

  transform: async (input) => {
    const text = await readFile(input.filePath, 'utf-8');
    const lines = text.trim().split('\n');
    const headers = lines[0]!.split(',').map((h) => h.trim());

    const rows: SaleRow[] = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        row[h] = values[i];
      });
      return {
        date: String(row['date'] ?? ''),
        product: String(row['product'] ?? ''),
        region: String(row['region'] ?? ''),
        quantity: parseInt(String(row['quantity'] ?? '0'), 10),
        unit_price: parseFloat(String(row['unit_price'] ?? '0')),
        revenue: parseFloat(String(row['revenue'] ?? '0')),
        salesperson_id: String(row['salesperson_id'] ?? ''),
      };
    });

    return { rows, source: input.filePath, rowCount: rows.length };
  },
});
