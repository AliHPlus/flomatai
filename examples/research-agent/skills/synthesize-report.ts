/**
 * Skill: synthesize-report
 *
 * Takes all gathered facts and produces a comprehensive research report.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const ResearchReportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  findings: z.array(z.object({
    section: z.string(),
    content: z.string(),
  })),
  sourcesUsed: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  gaps: z.array(z.string()),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;

export const synthesizeReportSkill = LLMSkill.create({
  name: 'synthesize-report',
  description: 'Synthesizes all gathered facts into a comprehensive structured research report',
  llm: 'default',

  inputSchema: z.object({
    topic: z.string(),
    allFacts: z.array(z.object({
      facts: z.array(z.string()),
      sourceUrl: z.string(),
      relevanceScore: z.number(),
    })),
    searchesPerformed: z.array(z.string()),
  }),
  outputSchema: ResearchReportSchema,

  systemMessage: 'You are a research analyst. Synthesize facts from multiple sources into a well-structured report. Output ONLY valid JSON.',

  prompt: (input) => {
    const highQualityFacts = input.allFacts
      .filter((f) => f.relevanceScore > 0.3)
      .flatMap((f) => f.facts.map((fact) => `[${f.sourceUrl}] ${fact}`));

    const sources = [...new Set(input.allFacts
      .filter((f) => f.facts.length > 0)
      .map((f) => f.sourceUrl))];

    return `Write a comprehensive research report on: "${input.topic}"

Searches performed: ${input.searchesPerformed.join(', ')}

Gathered facts (${highQualityFacts.length} total):
${highQualityFacts.slice(0, 50).join('\n')}

Sources: ${sources.join(', ')}

Output ONLY valid JSON:
{
  "title": "Research Report: [topic]",
  "summary": "2-3 paragraph executive summary",
  "findings": [
    { "section": "Section Name", "content": "detailed findings for this section (150-250 words)" }
  ],
  "sourcesUsed": ["url1", "url2"],
  "confidence": "high|medium|low",
  "gaps": ["what additional research would be needed", "..."]
}

Create 3-5 meaningful sections based on the gathered facts.`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as ResearchReport;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as ResearchReport;
      return {
        title: 'Research Report',
        summary: cleaned.substring(0, 500),
        findings: [],
        sourcesUsed: [],
        confidence: 'low' as const,
        gaps: ['Could not parse report output'],
      };
    }
  },

  llmOptions: { temperature: 0.2, maxTokens: 3000 },
  retries: 2,
});
