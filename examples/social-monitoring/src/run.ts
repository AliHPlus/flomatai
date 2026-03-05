/**
 * Social Monitoring Pipeline — runner script.
 *
 * Usage:
 *   # Mock mode (no network/API calls needed for sources):
 *   node dist/src/run.js --mock --brand "Acme Corp"
 *
 *   # Real RSS feeds (still needs LLM API key):
 *   node dist/src/run.js --brand "Acme" --keywords "acme,acmecorp" \
 *     --rss https://news.ycombinator.com/rss,https://lobste.rs/rss
 *
 *   # Save digest:
 *   node dist/src/run.js --mock --brand "Acme" --output ./digest.md
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getArg, hasFlag } from '@flomatai/core';
import { socialMonitoringPipeline } from './pipeline.js';
import { orchestrator } from './orchestrator.js';
import type { Digest } from '../skills/generate-digest.js';

async function main() {
  const mock = hasFlag('--mock') || process.env['MOCK'] === 'true';
  const brand = getArg('--brand') ?? process.env['BRAND_NAME'] ?? 'Acme Corp';
  const keywordsStr = getArg('--keywords') ?? process.env['KEYWORDS'] ?? brand.toLowerCase();
  const keywords = keywordsStr.split(',').map((k) => k.trim());
  const rssFeedsStr = getArg('--rss') ?? process.env['RSS_FEEDS'] ?? '';
  const rssFeeds = rssFeedsStr ? rssFeedsStr.split(',').map((u) => u.trim()) : [];
  const outputDir = getArg('--output-dir') ?? process.env['OUTPUT_DIR'] ?? './output';
  const outputFile = getArg('--output');
  const brandVoice = getArg('--voice') ?? process.env['BRAND_VOICE'];

  console.log(`\nSocial Monitoring — "${brand}"`);
  console.log(`  Mode:     ${mock ? 'MOCK (synthetic data)' : 'LIVE (RSS feeds)'}`);
  console.log(`  Keywords: ${keywords.join(', ')}`);
  if (!mock && rssFeeds.length > 0) {
    console.log(`  Feeds:    ${rssFeeds.join(', ')}`);
  }

  try {
    const { output } = await orchestrator.run(socialMonitoringPipeline, {
      brand,
      keywords,
      rssFeeds: mock ? [] : rssFeeds,
      mock,
      brandVoice,
    });

    const digest = output as Digest;

    // Format sentiment bar
    const total = Object.values(digest.sentimentBreakdown).reduce((a, b) => a + b, 0) || 1;
    const sentimentBar = Object.entries(digest.sentimentBreakdown)
      .map(([k, v]) => `${k}: ${v} (${Math.round(v / total * 100)}%)`)
      .join(' | ');

    // Build markdown report
    const markdown = [
      `# Social Monitoring Digest — ${digest.brand}`,
      `_${digest.date} | ${digest.totalMentions} mentions_`,
      '',
      '## Executive Summary',
      '',
      digest.executiveSummary,
      '',
      '## Sentiment Breakdown',
      '',
      sentimentBar,
      '',
      '## Top Themes',
      '',
      ...digest.topThemes.map((t) => `- ${t}`),
      '',
      ...(digest.urgentItems.length > 0 ? [
        '## Urgent Items (Response Required)',
        '',
        ...digest.urgentItems.flatMap((item) => {
          const urgencyEmoji = item['urgency'] === 'critical' ? '🔴' : item['urgency'] === 'high' ? '🟠' : '🟡';
          return [
            `### ${urgencyEmoji} ${item['title']}`,
            '',
            item['summary'] as string,
            '',
            ...(item['draftResponse'] ? [`**Draft response:** ${item['draftResponse']}`] : []),
            '',
          ];
        }),
      ] : []),
      '## Recommendations',
      '',
      ...digest.recommendations.map((r) => `- ${r}`),
    ].join('\n');

    // Print summary
    console.log('\n── Digest Summary ─────────────────────────────────────');
    console.log(`  Mentions:   ${digest.totalMentions}`);
    console.log(`  Sentiment:  ${sentimentBar}`);
    console.log(`  Urgent:     ${digest.urgentItems.length} items`);
    console.log(`  Themes:     ${digest.topThemes.slice(0, 3).join(', ')}`);
    console.log('');
    console.log('  Executive Summary:');
    console.log(`  ${digest.executiveSummary}`);

    if (digest.recommendations.length > 0) {
      console.log('\n  Recommendations:');
      digest.recommendations.forEach((r) => console.log(`  - ${r}`));
    }
    console.log('────────────────────────────────────────────────────────');

    // Save report
    const savePath = outputFile ?? join(outputDir, `digest-${digest.date}.md`);
    if (outputFile) {
      await writeFile(savePath, markdown, 'utf-8');
    } else {
      await mkdir(outputDir, { recursive: true });
      await writeFile(savePath, markdown, 'utf-8');
    }
    console.log(`\n✓ Digest saved: ${savePath}`);
  } catch (err) {
    console.error('\nPipeline failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
