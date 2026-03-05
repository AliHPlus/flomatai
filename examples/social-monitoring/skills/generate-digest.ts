/**
 * Skill: generate-digest
 *
 * Aggregates all classified mentions and response drafts into a daily digest report.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';
import type { Mention } from './fetch-mentions.js';
import type { Classification } from './classify-mention.js';
import type { ResponseDraft } from './draft-response.js';

export const DigestSchema = z.object({
  date: z.string(),
  brand: z.string(),
  totalMentions: z.number(),
  sentimentBreakdown: z.record(z.number()),
  urgentItems: z.array(z.object({
    mentionId: z.string(),
    title: z.string(),
    urgency: z.string(),
    summary: z.string(),
    draftResponse: z.string().optional(),
  })),
  executiveSummary: z.string(),
  topThemes: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type Digest = z.infer<typeof DigestSchema>;

export const generateDigestSkill = LLMSkill.create({
  name: 'generate-digest',
  description: 'Generates a daily social monitoring digest from classified mentions and response drafts',
  llm: 'default',

  inputSchema: z.object({
    brand: z.string(),
    mentions: z.array(z.record(z.unknown())),
    classifications: z.array(z.record(z.unknown())),
    drafts: z.array(z.record(z.unknown())),
    date: z.string(),
  }),
  outputSchema: DigestSchema,

  systemMessage: 'You write concise executive digests for social media monitoring reports. Be data-driven. Output ONLY valid JSON.',

  prompt: (input) => {
    const mentions = input.mentions as Mention[];
    const classifications = input.classifications as Classification[];
    const drafts = input.drafts as ResponseDraft[];

    const sentimentCounts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    const urgentItems: Array<{ id: string; title: string; urgency: string; summary: string }> = [];

    for (const c of classifications) {
      sentimentCounts[c.sentiment] = (sentimentCounts[c.sentiment] ?? 0) + 1;
      if (c.urgency === 'high' || c.urgency === 'critical') {
        const mention = mentions.find((m) => m.id === c.id);
        if (mention) {
          urgentItems.push({
            id: c.id,
            title: mention.title,
            urgency: c.urgency,
            summary: c.summary,
          });
        }
      }
    }

    const categoryCounts: Record<string, number> = {};
    for (const c of classifications) {
      categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1;
    }

    const draftSummary = drafts
      .slice(0, 5)
      .map((d) => `- [${d.channel}] ${d.draft.substring(0, 100)}...`)
      .join('\n');

    return `Generate a daily social monitoring digest for ${input.brand} (${input.date}).

STATS:
- Total mentions: ${mentions.length}
- Sentiment: ${JSON.stringify(sentimentCounts)}
- Categories: ${JSON.stringify(categoryCounts)}
- Urgent items: ${urgentItems.length}
- Responses drafted: ${drafts.length}

URGENT ITEMS:
${urgentItems.map((u) => `- [${u.urgency.toUpperCase()}] ${u.title}: ${u.summary}`).join('\n') || 'None'}

DRAFTED RESPONSES (sample):
${draftSummary || 'None'}

ALL MENTION SUMMARIES:
${classifications.map((c) => `- [${c.sentiment}/${c.urgency}] ${c.summary}`).join('\n')}

Output ONLY valid JSON:
{
  "date": "${input.date}",
  "brand": "${input.brand}",
  "totalMentions": ${mentions.length},
  "sentimentBreakdown": ${JSON.stringify(sentimentCounts)},
  "urgentItems": [
    { "mentionId": "id", "title": "...", "urgency": "high", "summary": "...", "draftResponse": "..." }
  ],
  "executiveSummary": "2-3 sentence high-level summary for leadership",
  "topThemes": ["theme 1", "theme 2", "theme 3"],
  "recommendations": ["action 1", "action 2"]
}`;
  },

  parseOutput: (raw, input) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as Digest;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as Digest;
      return {
        date: input.date,
        brand: input.brand,
        totalMentions: (input.mentions as unknown[]).length,
        sentimentBreakdown: {},
        urgentItems: [],
        executiveSummary: cleaned.substring(0, 300),
        topThemes: [],
        recommendations: [],
      };
    }
  },

  llmOptions: { temperature: 0.2, maxTokens: 2048 },
  retries: 2,
});
