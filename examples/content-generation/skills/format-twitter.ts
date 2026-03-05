/**
 * Skill: format-twitter
 *
 * Generates a Twitter/X thread (5-8 tweets) from a content brief.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';
import type { TopicBrief } from './research-topic.js';

export const TwitterThreadSchema = z.object({
  tweets: z.array(z.object({
    position: z.number(),
    text: z.string(),
    charCount: z.number(),
  })),
  hashtags: z.array(z.string()),
});

export type TwitterThread = z.infer<typeof TwitterThreadSchema>;

export const formatTwitterSkill = LLMSkill.create({
  name: 'format-twitter',
  description: 'Generates a Twitter/X thread from a content brief',
  llm: 'default',

  inputSchema: z.object({
    brief: z.record(z.unknown()),
  }),
  outputSchema: TwitterThreadSchema,

  systemMessage: 'You are a Twitter content creator. Write engaging threads that drive engagement. Each tweet max 280 chars. Output ONLY valid JSON.',

  prompt: (input) => {
    const brief = input.brief as TopicBrief;
    return `Create a Twitter thread about: ${brief.topic}

Summary: ${brief.summary}
Key Points: ${brief.keyPoints.join('; ')}
Audience: ${brief.audience}
Tone: ${brief.tone}
Keywords: ${brief.keywords.join(', ')}

Rules:
- 5-8 tweets
- Each tweet max 280 characters
- First tweet is the hook (include a number: "5 things about...")
- Use emojis sparingly
- End with a call-to-action

Output ONLY valid JSON:
{
  "tweets": [
    { "position": 1, "text": "tweet text here", "charCount": 150 }
  ],
  "hashtags": ["#hashtag1", "#hashtag2"]
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as TwitterThread;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as TwitterThread;
      return { tweets: [{ position: 1, text: cleaned.substring(0, 280), charCount: 280 }], hashtags: [] };
    }
  },

  llmOptions: { temperature: 0.6, maxTokens: 1500 },
});
