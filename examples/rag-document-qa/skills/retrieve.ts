/**
 * Skill: retrieve
 *
 * Given a query, retrieves the top-K most relevant chunks from the in-memory
 * TF-IDF vector store built by the ingest-docs skill.
 */

import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';
import { globalVectorStore } from './ingest-docs.js';
import type { SearchResult } from './vector-store.js';

export const RetrieveOutputSchema = z.object({
  query: z.string(),
  results: z.array(z.object({
    source: z.string(),
    text: z.string(),
    score: z.number(),
    startChar: z.number(),
  })),
});

export type RetrieveOutput = z.infer<typeof RetrieveOutputSchema>;

export const retrieveSkill = TransformSkill.create({
  name: 'retrieve',
  description: 'Retrieves top-K relevant chunks from the TF-IDF index for a given query',
  inputSchema: z.object({
    query: z.string(),
    topK: z.number().optional(),
  }),
  outputSchema: RetrieveOutputSchema,

  transform: (input) => {
    const { query, topK = 5 } = input;

    if (!globalVectorStore) {
      throw new Error('Vector store not initialized. Run ingest-docs first.');
    }

    const results: SearchResult[] = globalVectorStore.search(query, topK);

    return {
      query,
      results: results.map((r) => ({
        source: r.chunk.source,
        text: r.chunk.text,
        score: Math.round(r.score * 1000) / 1000,
        startChar: r.chunk.startChar,
      })),
    };
  },
});
