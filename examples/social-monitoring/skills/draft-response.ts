/**
 * Skill: draft-response
 *
 * Drafts a response to a mention that requires one.
 * Only called for mentions where requiresResponse=true.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';
import type { Classification } from './classify-mention.js';

export const ResponseDraftSchema = z.object({
  mentionId: z.string(),
  draft: z.string(),
  tone: z.string(),
  channel: z.string(),
  charCount: z.number(),
  requiresHumanReview: z.boolean(),
});

export type ResponseDraft = z.infer<typeof ResponseDraftSchema>;

export const draftResponseSkill = LLMSkill.create({
  name: 'draft-response',
  description: 'Drafts an appropriate response to a brand mention requiring engagement',
  llm: 'default',

  inputSchema: z.object({
    mention: z.record(z.unknown()),
    classification: z.record(z.unknown()),
    brand: z.string(),
    brandVoice: z.string().optional(),
  }),
  outputSchema: ResponseDraftSchema,

  systemMessage: `You draft responses for a B2B SaaS company's social media team.
Guidelines:
- Be genuinely helpful, not corporate-speak
- For bug reports: acknowledge, apologize, provide next steps
- For criticism: acknowledge the feedback, be specific about improvements
- For questions: provide a direct, useful answer
- Never make promises you can't keep
- Always stay professional but human
- Keep responses concise (under 280 chars for Twitter, up to 500 for forums)
Output ONLY valid JSON.`,

  prompt: (input) => {
    const m = input.mention as { id: string; title: string; excerpt: string; source: string; author?: string };
    const c = input.classification as Classification;
    const isTwitter = m.source.includes('twitter') || m.source.includes('x.com');

    return `Draft a response to this ${c.category} mention (${c.sentiment} sentiment, ${c.urgency} urgency):

Source: ${m.source}
Author: @${m.author ?? 'user'}
Title: ${m.title}
Content: ${m.excerpt}

Brand voice: ${input.brandVoice ?? 'Professional, helpful, genuine. No marketing speak.'}
Max length: ${isTwitter ? '280 characters (Twitter)' : '400 characters'}

Output ONLY valid JSON:
{
  "mentionId": "${m.id}",
  "draft": "the response text here",
  "tone": "empathetic|professional|enthusiastic|apologetic",
  "channel": "${m.source}",
  "charCount": 150,
  "requiresHumanReview": false
}

Mark requiresHumanReview=true if: legal implications, refund/compensation offers, outage acknowledgments, anything sensitive.`;
  },

  parseOutput: (raw, input) => {
    const m = input.mention as { id: string };
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as ResponseDraft;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as ResponseDraft;
      return {
        mentionId: m.id,
        draft: cleaned.substring(0, 400),
        tone: 'professional',
        channel: 'unknown',
        charCount: cleaned.length,
        requiresHumanReview: true,
      };
    }
  },

  llmOptions: { temperature: 0.4, maxTokens: 512 },
  retries: 2,
});
