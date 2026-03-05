/**
 * Content Generation Pipeline — runner script.
 *
 * Usage:
 *   node dist/src/run.js --topic "The future of AI automation"
 *   node dist/src/run.js --topic "TypeScript generics" --audience "developers" --tone "educational"
 *   node dist/src/run.js --topic "Remote work trends" --translate-to "Spanish"
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getArg } from '@flomatai/core';
import { contentGenerationPipeline } from './pipeline.js';
import { orchestrator } from './orchestrator.js';

async function main() {
  const topic = getArg('--topic') ?? process.env['TOPIC'];
  if (!topic) {
    console.error('Error: --topic <topic> is required');
    console.error('Example: node dist/src/run.js --topic "The future of AI agents"');
    process.exit(1);
  }

  const audience = getArg('--audience') ?? process.env['AUDIENCE'];
  const tone = getArg('--tone') ?? process.env['TONE'];
  const context = getArg('--context') ?? process.env['CONTEXT'];
  const translateTo = getArg('--translate-to') ?? process.env['TRANSLATE_TO'];
  const outputDir = getArg('--output') ?? process.env['OUTPUT_DIR'] ?? './output';

  console.log(`\nTopic: "${topic}"`);
  if (audience) console.log(`Audience: ${audience}`);
  if (tone) console.log(`Tone: ${tone}`);
  if (translateTo) console.log(`Translating to: ${translateTo}`);

  try {
    const { output } = await orchestrator.run(contentGenerationPipeline, {
      topic,
      audience,
      tone,
      context,
      translateTo,
    });

    // The pipeline output is an array from parallel step + optional translate step
    // Parse the results
    const results = output as Array<Record<string, unknown>>;

    // Parallel step returns array of sub-pipeline outputs
    let parallelResults: Array<Record<string, unknown>> = [];
    let translationResult: Record<string, unknown> | null = null;

    if (Array.isArray(results)) {
      // If translate was skipped, output is just the parallel results array
      // If translate ran, last element is the translation
      if (results.length > 0 && 'translatedContent' in (results[results.length - 1] ?? {})) {
        translationResult = results[results.length - 1] as Record<string, unknown>;
        parallelResults = results.slice(0, -1) as Array<Record<string, unknown>>;
      } else {
        parallelResults = results as Array<Record<string, unknown>>;
      }
    }

    // Extract outputs by format name
    const blog = parallelResults.find((r) => 'blog' in r)?.['blog'] as Record<string, unknown> | undefined;
    const twitter = parallelResults.find((r) => 'twitter' in r)?.['twitter'] as Record<string, unknown> | undefined;
    const linkedin = parallelResults.find((r) => 'linkedin' in r)?.['linkedin'] as Record<string, unknown> | undefined;
    const tldr = parallelResults.find((r) => 'tldr' in r)?.['tldr'] as Record<string, unknown> | undefined;

    // Save outputs
    await mkdir(outputDir, { recursive: true });
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);

    console.log('\n── Generated Content ──────────────────────────────');

    if (blog) {
      const blogPath = join(outputDir, `${slug}-blog.md`);
      await writeFile(blogPath, [
        `# ${blog['title']}`,
        `_${blog['metaDescription']}_`,
        '',
        blog['content'],
      ].join('\n'), 'utf-8');
      console.log(`  Blog post:    ${blogPath} (~${blog['readingTimeMinutes']} min read)`);
    }

    if (twitter) {
      const tweets = twitter['tweets'] as Array<{ position: number; text: string }>;
      const twitterPath = join(outputDir, `${slug}-twitter.md`);
      await writeFile(twitterPath, [
        `# Twitter Thread: ${topic}`,
        '',
        ...tweets.map((t) => `**[${t.position}/${tweets.length}]** ${t.text}`),
        '',
        `Hashtags: ${(twitter['hashtags'] as string[]).join(' ')}`,
      ].join('\n\n'), 'utf-8');
      console.log(`  Twitter thread: ${twitterPath} (${tweets.length} tweets)`);
    }

    if (linkedin) {
      const linkedinPath = join(outputDir, `${slug}-linkedin.md`);
      await writeFile(linkedinPath, [
        `# LinkedIn Post: ${topic}`,
        '',
        linkedin['fullPost'],
      ].join('\n'), 'utf-8');
      console.log(`  LinkedIn post: ${linkedinPath}`);
    }

    if (tldr) {
      const tldrPath = join(outputDir, `${slug}-tldr.md`);
      const bullets = tldr['bullets'] as string[];
      await writeFile(tldrPath, [
        `# TL;DR: ${tldr['headline']}`,
        '',
        tldr['summary'],
        '',
        bullets.map((b) => `- ${b}`).join('\n'),
        '',
        `**Takeaway:** ${tldr['takeaway']}`,
      ].join('\n'), 'utf-8');
      console.log(`  TL;DR:        ${tldrPath}`);
    }

    if (translationResult) {
      const transPath = join(outputDir, `${slug}-blog-${translateTo?.toLowerCase()}.md`);
      await writeFile(transPath, translationResult['translatedContent'] as string, 'utf-8');
      console.log(`  Translation:  ${transPath} (${translateTo})`);
    }

    console.log('──────────────────────────────────────────────────');
  } catch (err) {
    console.error('\nPipeline failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
