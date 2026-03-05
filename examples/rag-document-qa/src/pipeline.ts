/**
 * RAG Document Q&A Pipeline
 *
 * Ingests documents into an in-memory TF-IDF vector store, retrieves
 * relevant chunks for a query, then generates a grounded answer with citations.
 *
 * Pipeline graph:
 *   ingest-docs → retrieve → generate-answer
 *
 * No external vector DB required — everything lives in memory.
 *
 * Input:  { paths: string[], query: string, topK?: number, chunkSize?: number }
 * Output: { answer: string, citations: [...], confidence: string }
 */

import { z } from 'zod';
import { Pipeline } from '@flomatai/core';
import { ingestDocsSkill } from '../skills/ingest-docs.js';
import { retrieveSkill } from '../skills/retrieve.js';
import { generateAnswerSkill } from '../skills/generate-answer.js';

export const ragPipeline = Pipeline.create('rag-document-qa')
  .input(z.object({
    paths: z.array(z.string()),
    query: z.string(),
    topK: z.number().optional(),
    chunkSize: z.number().optional(),
    chunkOverlap: z.number().optional(),
  }))

  // Step 1: Ingest all documents, chunk them, build TF-IDF index
  .step('ingest', ingestDocsSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as {
        paths: string[];
        chunkSize?: number;
        chunkOverlap?: number;
      };
      return {
        paths: pi.paths,
        chunkSize: pi.chunkSize,
        chunkOverlap: pi.chunkOverlap,
      };
    },
  })

  // Step 2: Retrieve top-K chunks relevant to the query
  .step('retrieve', retrieveSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { query: string; topK?: number };
      return {
        query: pi.query,
        topK: pi.topK ?? 5,
      };
    },
  })

  // Step 3: Generate grounded answer with citations
  .step('answer', generateAnswerSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { query: string };
      const retrieved = ctx.stepOutputs['retrieve'] as {
        query: string;
        results: Array<{ source: string; text: string; score: number; startChar: number }>;
      };
      return {
        query: pi.query,
        results: retrieved.results,
      };
    },
  })

  .output(z.object({
    answer: z.string(),
    citations: z.array(z.object({
      source: z.string(),
      excerpt: z.string(),
    })),
    confidence: z.enum(['high', 'medium', 'low']),
  }))

  .build();
