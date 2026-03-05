/**
 * Skill: ingest-docs
 *
 * Reads one or more document files, splits them into chunks, and builds
 * an in-memory TF-IDF vector store. Returns a serialized index handle.
 *
 * Since the VectorStore lives in memory, we pass it through the pipeline
 * via a module-level singleton (acceptable for a single-run CLI tool).
 */

import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';
import { VectorStore } from './vector-store.js';

// Module-level singleton — available to subsequent skills in the same process
export let globalVectorStore: VectorStore | null = null;

export const IngestOutputSchema = z.object({
  chunkCount: z.number(),
  documentCount: z.number(),
  sources: z.array(z.string()),
});

export type IngestOutput = z.infer<typeof IngestOutputSchema>;

export const ingestDocsSkill = TransformSkill.create({
  name: 'ingest-docs',
  description: 'Reads documents, chunks them, and builds an in-memory TF-IDF index',
  inputSchema: z.object({
    paths: z.array(z.string()),   // file paths or directory paths
    chunkSize: z.number().optional(),
    chunkOverlap: z.number().optional(),
  }),
  outputSchema: IngestOutputSchema,

  transform: async (input) => {
    const { paths, chunkSize = 500, chunkOverlap = 50 } = input;
    const store = new VectorStore(chunkSize, chunkOverlap);
    const sources: string[] = [];

    for (const p of paths) {
      let isDir = false;
      try {
        const entries = await readdir(p);
        isDir = true;
        // It's a directory — ingest all .md and .txt files
        for (const entry of entries) {
          const ext = extname(entry).toLowerCase();
          if (ext === '.md' || ext === '.txt') {
            const filePath = join(p, entry);
            const text = await readFile(filePath, 'utf-8');
            store.addDocument(entry, text);
            sources.push(entry);
          }
        }
        void isDir;
      } catch {
        // Not a directory — treat as file
        const text = await readFile(p, 'utf-8');
        const name = p.split('/').pop() ?? p;
        store.addDocument(name, text);
        sources.push(name);
      }
    }

    store.buildIndex();
    globalVectorStore = store;

    return {
      chunkCount: store.size,
      documentCount: sources.length,
      sources,
    };
  },
});
