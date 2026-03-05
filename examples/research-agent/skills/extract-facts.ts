/**
 * Skill: extract-facts
 *
 * Extracts key facts and claims from a scraped page, relevant to the research topic.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const extractFactsSkill = LLMSkill.create({
  name: 'extract-facts',
  description: 'Extracts key facts, data points, and claims from text relevant to a research topic',
  llm: 'default',

  inputSchema: z.object({
    text: z.string(),
    source: z.string(),
    topic: z.string(),
  }),
  outputSchema: z.object({
    facts: z.array(z.string()),
    sourceUrl: z.string(),
    relevanceScore: z.number(),
  }),

  systemMessage: 'You are a research assistant. Extract factual claims from text. Be precise and cite numbers when available. Output ONLY valid JSON.',

  prompt: (input) => `Extract facts from this text relevant to: "${input.topic}"

Source: ${input.source}
Text:
${input.text.substring(0, 3000)}

Output ONLY valid JSON:
{
  "facts": [
    "specific factual claim with data (e.g., 'X grew by 45% in 2024')",
    "another specific fact"
  ],
  "sourceUrl": "${input.source}",
  "relevanceScore": 0.8
}

Rules:
- Only include facts directly relevant to the topic
- Each fact should be self-contained and specific (include numbers, dates, names)
- relevanceScore: 0.0 (not relevant) to 1.0 (highly relevant)
- If the text has no relevant facts, return empty facts array with low relevanceScore`,

  parseOutput: (raw, input) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as { facts: string[]; sourceUrl: string; relevanceScore: number };
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as { facts: string[]; sourceUrl: string; relevanceScore: number };
      return { facts: [], sourceUrl: input.source, relevanceScore: 0 };
    }
  },

  llmOptions: { temperature: 0.1, maxTokens: 1024 },
  retries: 2,
});
