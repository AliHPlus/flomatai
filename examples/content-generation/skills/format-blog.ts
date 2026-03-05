/**
 * Skill: format-blog
 *
 * Generates a long-form blog post from a content brief.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';
import type { TopicBrief } from './research-topic.js';

export const BlogPostSchema = z.object({
  title: z.string(),
  slug: z.string(),
  metaDescription: z.string(),
  content: z.string(),
  readingTimeMinutes: z.number(),
});

export type BlogPost = z.infer<typeof BlogPostSchema>;

export const formatBlogSkill = LLMSkill.create({
  name: 'format-blog',
  description: 'Generates a long-form blog post from a content brief',
  llm: 'default',

  inputSchema: z.object({
    brief: z.record(z.unknown()),
  }),
  outputSchema: BlogPostSchema,

  systemMessage: 'You are an expert blog writer. Write engaging, well-structured long-form content. Output ONLY valid JSON.',

  prompt: (input) => {
    const brief = input.brief as TopicBrief;
    return `Write a comprehensive blog post based on this brief:

Topic: ${brief.topic}
Summary: ${brief.summary}
Key Points: ${brief.keyPoints.join(', ')}
Audience: ${brief.audience}
Tone: ${brief.tone}
Unique Angle: ${brief.uniqueAngle}
Keywords: ${brief.keywords.join(', ')}

Output ONLY valid JSON:
{
  "title": "Engaging blog post title",
  "slug": "url-friendly-slug",
  "metaDescription": "SEO meta description (max 160 chars)",
  "content": "Full blog post in markdown format with ## headers, bullet points, and at least 600 words",
  "readingTimeMinutes": 5
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as BlogPost;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as BlogPost;
      return { title: 'Blog Post', slug: 'blog-post', metaDescription: '', content: cleaned, readingTimeMinutes: 3 };
    }
  },

  llmOptions: { temperature: 0.5, maxTokens: 3000 },
});
