/**
 * Skill: format-linkedin
 *
 * Generates a LinkedIn post from a content brief.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';
import type { TopicBrief } from './research-topic.js';

export const LinkedInPostSchema = z.object({
  hook: z.string(),
  body: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  fullPost: z.string(),
});

export type LinkedInPost = z.infer<typeof LinkedInPostSchema>;

export const formatLinkedInSkill = LLMSkill.create({
  name: 'format-linkedin',
  description: 'Generates a LinkedIn post from a content brief',
  llm: 'default',

  inputSchema: z.object({
    brief: z.record(z.unknown()),
  }),
  outputSchema: LinkedInPostSchema,

  systemMessage: 'You are a LinkedIn content creator. Write professional posts that get engagement. Output ONLY valid JSON.',

  prompt: (input) => {
    const brief = input.brief as TopicBrief;
    return `Create a LinkedIn post about: ${brief.topic}

Summary: ${brief.summary}
Key Points: ${brief.keyPoints.join('; ')}
Audience: ${brief.audience}
Tone: ${brief.tone}
Unique Angle: ${brief.uniqueAngle}

Rules:
- Hook: 1-2 lines that stop the scroll
- Body: 150-250 words with line breaks for readability
- Include a story or personal insight if appropriate
- End with a question or CTA to drive comments
- 3-5 relevant hashtags
- Total post: 1300-1800 characters

Output ONLY valid JSON:
{
  "hook": "opening 1-2 lines",
  "body": "main content with \\n for line breaks",
  "callToAction": "closing question or CTA",
  "hashtags": ["#Hashtag1", "#Hashtag2"],
  "fullPost": "complete formatted post ready to publish"
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as LinkedInPost;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as LinkedInPost;
      return { hook: '', body: cleaned, callToAction: '', hashtags: [], fullPost: cleaned };
    }
  },

  llmOptions: { temperature: 0.5, maxTokens: 1500 },
});
