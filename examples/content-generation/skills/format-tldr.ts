/**
 * Skill: format-tldr
 *
 * Generates a concise TL;DR summary (email newsletter snippet) from a content brief.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';
import type { TopicBrief } from './research-topic.js';

export const TLDRSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  bullets: z.array(z.string()),
  takeaway: z.string(),
});

export type TLDR = z.infer<typeof TLDRSchema>;

export const formatTLDRSkill = LLMSkill.create({
  name: 'format-tldr',
  description: 'Generates a TL;DR newsletter snippet from a content brief',
  llm: 'default',

  inputSchema: z.object({
    brief: z.record(z.unknown()),
  }),
  outputSchema: TLDRSchema,

  systemMessage: 'You write crisp, punchy TL;DR summaries for busy professionals. Be direct and valuable. Output ONLY valid JSON.',

  prompt: (input) => {
    const brief = input.brief as TopicBrief;
    return `Write a TL;DR newsletter snippet about: ${brief.topic}

Summary: ${brief.summary}
Key Points: ${brief.keyPoints.join('; ')}
Unique Angle: ${brief.uniqueAngle}

Output ONLY valid JSON:
{
  "headline": "Punchy 5-10 word headline",
  "summary": "2 sentence summary (max 50 words)",
  "bullets": ["key point 1 (max 15 words)", "key point 2", "key point 3"],
  "takeaway": "The one thing to remember (max 20 words)"
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as TLDR;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as TLDR;
      return { headline: 'Summary', summary: cleaned.substring(0, 200), bullets: [], takeaway: '' };
    }
  },

  llmOptions: { temperature: 0.3, maxTokens: 512 },
});
