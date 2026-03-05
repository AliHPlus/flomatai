/**
 * Skill: translate-content
 *
 * Translates a piece of content to a target language.
 * Used as an optional final step in the pipeline.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const translateContentSkill = LLMSkill.create({
  name: 'translate-content',
  description: 'Translates content to a target language while preserving formatting',
  llm: 'default',

  inputSchema: z.object({
    content: z.string(),
    format: z.string(),  // 'blog' | 'twitter' | 'linkedin' | 'tldr'
    targetLanguage: z.string(),
  }),
  outputSchema: z.object({
    translatedContent: z.string(),
    language: z.string(),
  }),

  prompt: (input) => `Translate the following ${input.format} content to ${input.targetLanguage}.
Preserve all formatting (markdown, line breaks, hashtags structure).
Adapt hashtags and idioms naturally for the target language.

Content to translate:
${input.content}

Return ONLY the translated content, nothing else.`,

  parseOutput: (raw, input) => ({
    translatedContent: raw.trim(),
    language: input.targetLanguage,
  }),

  llmOptions: { temperature: 0.2, maxTokens: 3000 },
});
