/**
 * Multi-Format Content Generation Pipeline
 *
 * Researches a topic, then generates 4 content formats in parallel:
 * blog post, Twitter thread, LinkedIn post, and TL;DR newsletter snippet.
 * Optionally translates all content to a target language.
 *
 * Pipeline graph:
 *   research-topic
 *       ↓
 *   parallel:
 *     ├── blog-pipeline  (format-blog)
 *     ├── twitter-pipeline (format-twitter)
 *     ├── linkedin-pipeline (format-linkedin)
 *     └── tldr-pipeline (format-tldr)
 *       ↓
 *   [optional] translate-content (if --language is set)
 *
 * Input:  { topic, audience?, tone?, context?, translateTo? }
 * Output: { brief, blog, twitter, linkedin, tldr, translations? }
 */

import { z } from 'zod';
import { Pipeline, TransformSkill } from '@flomatai/core';
import { researchTopicSkill } from '../skills/research-topic.js';
import { formatBlogSkill } from '../skills/format-blog.js';
import { formatTwitterSkill } from '../skills/format-twitter.js';
import { formatLinkedInSkill } from '../skills/format-linkedin.js';
import { formatTLDRSkill } from '../skills/format-tldr.js';
import { translateContentSkill } from '../skills/translate-content.js';

// Helper: pass brief from parent pipeline context to format sub-pipelines
function briefInputMapper(ctx: { pipelineInput: unknown; stepOutputs: Record<string, unknown>; previousOutput: unknown }) {
  // When used inside parallel, previousOutput is the brief from the research step
  const brief = ctx.previousOutput ?? ctx.stepOutputs['research'];
  return { brief };
}

// Sub-pipelines for each format (each receives the brief as input)
const blogPipeline = Pipeline.create('generate-blog')
  .step('blog', formatBlogSkill, { input: briefInputMapper })
  .build();

const twitterPipeline = Pipeline.create('generate-twitter')
  .step('twitter', formatTwitterSkill, { input: briefInputMapper })
  .build();

const linkedinPipeline = Pipeline.create('generate-linkedin')
  .step('linkedin', formatLinkedInSkill, { input: briefInputMapper })
  .build();

const tldrPipeline = Pipeline.create('generate-tldr')
  .step('tldr', formatTLDRSkill, { input: briefInputMapper })
  .build();

// Skill: assemble parallel results into a clean output object
const assembleSkill = TransformSkill.create({
  name: 'assemble',
  description: 'Assembles all format outputs into a single content package',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  transform: (input) => input,
});

// Skill: conditionally translate (wraps translate-content skill logic inline)
const prepareTranslationsSkill = TransformSkill.create({
  name: 'prepare-translations',
  description: 'Prepares translation input from assembled content',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  transform: (input) => input,
});

export const contentGenerationPipeline = Pipeline.create('content-generation')
  .input(z.object({
    topic: z.string(),
    audience: z.string().optional(),
    tone: z.string().optional(),
    context: z.string().optional(),
    translateTo: z.string().optional(),
  }))

  // Step 1: Research the topic and build a content brief
  .step('research', researchTopicSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as {
        topic: string;
        audience?: string;
        tone?: string;
        context?: string;
      };
      return {
        topic: pi.topic,
        audience: pi.audience,
        tone: pi.tone,
        context: pi.context,
      };
    },
  })

  // Step 2: Generate all 4 formats in parallel (each sub-pipeline gets the brief)
  .parallel([blogPipeline, twitterPipeline, linkedinPipeline, tldrPipeline], 'generate-all-formats')

  // Step 3: Translate blog post to target language (if requested)
  .step('translate-blog', translateContentSkill, {
    skipIf: (ctx) => {
      const pi = ctx.pipelineInput as { translateTo?: string };
      return !pi.translateTo;
    },
    input: (ctx) => {
      const pi = ctx.pipelineInput as { translateTo?: string };
      const parallelResults = ctx.previousOutput as Array<Record<string, unknown>>;
      const blogResult = parallelResults.find((r) => 'blog' in r);
      const blog = blogResult?.['blog'] as Record<string, unknown> | undefined;
      return {
        content: (blog?.['content'] as string) ?? '',
        format: 'blog',
        targetLanguage: pi.translateTo ?? 'English',
      };
    },
  })

  .build();
