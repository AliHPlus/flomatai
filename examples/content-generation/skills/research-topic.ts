/**
 * Skill: research-topic
 *
 * Researches a topic and produces a structured brief with key points,
 * audience targeting, and tone guidelines. This feeds all format skills.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const TopicBriefSchema = z.object({
  topic: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  audience: z.string(),
  tone: z.string(),
  keywords: z.array(z.string()),
  uniqueAngle: z.string(),
});

export type TopicBrief = z.infer<typeof TopicBriefSchema>;

export const researchTopicSkill = LLMSkill.create({
  name: 'research-topic',
  description: 'Researches a topic and creates a structured content brief',
  llm: 'default',

  inputSchema: z.object({
    topic: z.string(),
    audience: z.string().optional(),
    tone: z.string().optional(),
    context: z.string().optional(),
  }),
  outputSchema: TopicBriefSchema,

  systemMessage: 'You are a content strategist. Produce structured content briefs from topic inputs. Output ONLY valid JSON.',

  prompt: (input) => `Create a comprehensive content brief for the following topic:

Topic: ${input.topic}
${input.audience ? `Target Audience: ${input.audience}` : ''}
${input.tone ? `Desired Tone: ${input.tone}` : ''}
${input.context ? `Additional Context: ${input.context}` : ''}

Output ONLY valid JSON:
{
  "topic": "${input.topic}",
  "summary": "2-3 sentence overview of the topic",
  "keyPoints": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"],
  "audience": "specific audience description",
  "tone": "tone description (professional/casual/educational/etc.)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "uniqueAngle": "what makes this content fresh and valuable"
}`,

  parseOutput: (raw, input) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as TopicBrief;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return {
          topic: input.topic,
          summary: cleaned.substring(0, 300),
          keyPoints: [],
          audience: input.audience ?? 'general audience',
          tone: input.tone ?? 'professional',
          keywords: [],
          uniqueAngle: '',
        };
      }
      return JSON.parse(match[0]) as TopicBrief;
    }
  },

  llmOptions: { temperature: 0.3, maxTokens: 1024 },
});
