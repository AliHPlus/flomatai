/**
 * Skill: classify-mention
 *
 * Classifies a single mention: sentiment, relevance, category, and urgency.
 * Used inside mapOver for per-mention classification.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const ClassificationSchema = z.object({
  id: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  relevance: z.number().min(0).max(1),   // 0 = irrelevant, 1 = highly relevant
  category: z.enum(['bug-report', 'feature-request', 'praise', 'criticism', 'question', 'news', 'other']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  requiresResponse: z.boolean(),
  summary: z.string(),
  keyIssues: z.array(z.string()).optional(),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export const classifyMentionSkill = LLMSkill.create({
  name: 'classify-mention',
  description: 'Classifies a brand mention for sentiment, category, urgency, and response requirement',
  llm: 'default',

  inputSchema: z.object({
    mention: z.record(z.unknown()),
    brand: z.string(),
    keywords: z.array(z.string()),
  }),
  outputSchema: ClassificationSchema,

  systemMessage: 'You are a social media analyst for a B2B SaaS company. Classify mentions accurately and concisely. Output ONLY valid JSON.',

  prompt: (input) => {
    const m = input.mention as { id: string; title: string; excerpt: string; source: string; author?: string };
    return `Classify this mention of "${input.brand}":

Source: ${m.source}
Author: ${m.author ?? 'unknown'}
Title: ${m.title}
Content: ${m.excerpt}

Output ONLY valid JSON:
{
  "id": "${m.id}",
  "sentiment": "positive|negative|neutral|mixed",
  "relevance": 0.8,
  "category": "bug-report|feature-request|praise|criticism|question|news|other",
  "urgency": "low|medium|high|critical",
  "requiresResponse": true,
  "summary": "1 sentence summary of the mention",
  "keyIssues": ["issue1", "issue2"]
}

Urgency rules:
- critical: outage/data-loss reports, viral negative coverage
- high: unresolved customer complaints, security issues
- medium: feature requests, constructive criticism, questions
- low: general discussion, praise, news`;
  },

  parseOutput: (raw, input) => {
    const m = input.mention as { id: string };
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as Classification;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as Classification;
      return {
        id: m.id,
        sentiment: 'neutral',
        relevance: 0.5,
        category: 'other',
        urgency: 'low',
        requiresResponse: false,
        summary: 'Could not classify',
        keyIssues: [],
      };
    }
  },

  llmOptions: { temperature: 0.1, maxTokens: 512 },
  retries: 2,
});
