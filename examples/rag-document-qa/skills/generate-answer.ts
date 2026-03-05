/**
 * Skill: generate-answer
 *
 * Takes retrieved chunks and the original query, then generates a grounded
 * answer with source citations using an LLM.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const AnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    source: z.string(),
    excerpt: z.string(),
  })),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type Answer = z.infer<typeof AnswerSchema>;

export const generateAnswerSkill = LLMSkill.create({
  name: 'generate-answer',
  description: 'Generates a grounded answer with citations from retrieved document chunks',
  llm: 'default',

  inputSchema: z.object({
    query: z.string(),
    results: z.array(z.object({
      source: z.string(),
      text: z.string(),
      score: z.number(),
      startChar: z.number(),
    })),
  }),
  outputSchema: AnswerSchema,

  systemMessage: `You are a document Q&A assistant. Answer questions using ONLY the provided context.
If the context does not contain enough information to answer, say so honestly.
Always cite your sources. Output ONLY valid JSON.`,

  prompt: (input) => {
    const contextBlocks = input.results
      .map((r, i) => `[${i + 1}] Source: ${r.source} (relevance: ${r.score})\n${r.text}`)
      .join('\n\n---\n\n');

    return `Question: ${input.query}

Context:
${contextBlocks || '(No relevant documents found)'}

Output ONLY valid JSON:
{
  "answer": "your complete answer here, referencing [1], [2] etc. for citations",
  "citations": [
    { "source": "filename.md", "excerpt": "exact quoted text used" }
  ],
  "confidence": "high|medium|low"
}

Base your answer ONLY on the provided context. If not found, say "I could not find information about this in the provided documents."`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as Answer;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return {
          answer: cleaned,
          citations: [],
          confidence: 'low' as const,
        };
      }
      return JSON.parse(match[0]) as Answer;
    }
  },

  llmOptions: { temperature: 0.1, maxTokens: 2048 },
  retries: 2,
});
