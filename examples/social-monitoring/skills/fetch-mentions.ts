/**
 * Skill: fetch-mentions
 *
 * Fetches mentions of a brand/keywords from RSS feeds.
 * In --mock mode, returns a rich set of synthetic mentions — no network calls.
 *
 * Real mode: parses RSS XML from configured feed URLs.
 */

import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const MentionSchema = z.object({
  id: z.string(),
  source: z.string(),        // 'hacker-news' | 'reddit' | 'dev.to' | 'rss:<url>'
  title: z.string(),
  excerpt: z.string(),
  url: z.string(),
  publishedAt: z.string(),   // ISO 8601
  author: z.string().optional(),
});

export type Mention = z.infer<typeof MentionSchema>;

function generateMockMentions(brand: string, keywords: string[]): Mention[] {
  const kw = keywords[0] ?? brand;
  const now = new Date();
  const ts = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();

  return [
    {
      id: 'mock-001',
      source: 'hacker-news',
      title: `Ask HN: Has anyone used ${brand} in production?`,
      excerpt: `We've been evaluating ${brand} for our data pipeline. The API is intuitive but the pricing is a concern for our scale. Looking for alternatives or tips on optimization.`,
      url: 'https://news.ycombinator.com/item?id=mock001',
      publishedAt: ts(2),
      author: 'throwaway12345',
    },
    {
      id: 'mock-002',
      source: 'hacker-news',
      title: `${brand} just shipped their v2.0 and it's genuinely impressive`,
      excerpt: `I've been a skeptic but the new ${kw} release addresses most of my complaints. The performance improvements are real and the new API is much cleaner. Highly recommend giving it another look.`,
      url: 'https://news.ycombinator.com/item?id=mock002',
      publishedAt: ts(5),
      author: 'dev_enthusiast',
    },
    {
      id: 'mock-003',
      source: 'dev.to',
      title: `Building a RAG pipeline with ${brand}: A practical guide`,
      excerpt: `In this tutorial, I'll show you how to use ${kw} to build a production-ready RAG system. We'll cover chunking strategies, retrieval optimization, and deployment tips.`,
      url: 'https://dev.to/author/building-rag-with-brand',
      publishedAt: ts(8),
      author: 'tech_writer_pro',
    },
    {
      id: 'mock-004',
      source: 'reddit',
      title: `${brand} vs competitors - honest comparison after 6 months`,
      excerpt: `TLDR: ${brand} wins on DX and docs. Competitors win on price for large scale. ${brand} support team is responsive but billing issues took 2 weeks to resolve which was frustrating.`,
      url: 'https://reddit.com/r/MachineLearning/mock004',
      publishedAt: ts(12),
      author: 'ml_practitioner',
    },
    {
      id: 'mock-005',
      source: 'reddit',
      title: `${kw} outage - anyone else affected?`,
      excerpt: `Seeing 503 errors from ${brand} API for the past 30 minutes. Status page shows all green but clearly something is wrong. This is the 3rd incident this month.`,
      url: 'https://reddit.com/r/devops/mock005',
      publishedAt: ts(1),
      author: 'ops_frustrated',
    },
    {
      id: 'mock-006',
      source: 'dev.to',
      title: `My experience migrating from ${brand} to self-hosted alternatives`,
      excerpt: `After 18 months with ${brand} we decided to self-host. Here's why: cost at scale, data sovereignty concerns, and vendor lock-in risk. The migration took 2 months but was worth it.`,
      url: 'https://dev.to/migration-story',
      publishedAt: ts(20),
      author: 'startup_cto',
    },
    {
      id: 'mock-007',
      source: 'hacker-news',
      title: `${brand} raises Series B - but should they focus on profitability instead?`,
      excerpt: `Interesting timing for ${brand} to raise given the market. Their burn rate is concerning and I worry the VC money will push them to grow at all costs rather than build sustainable revenue.`,
      url: 'https://news.ycombinator.com/item?id=mock007',
      publishedAt: ts(18),
      author: 'vc_skeptic',
    },
    {
      id: 'mock-008',
      source: 'hacker-news',
      title: `${brand} new open-source SDK is excellent`,
      excerpt: `Just integrated the new ${kw} SDK. The TypeScript types are perfect, the error messages are actually helpful, and the docs examples all work. This is what good open source looks like.`,
      url: 'https://news.ycombinator.com/item?id=mock008',
      publishedAt: ts(6),
      author: 'happy_developer',
    },
  ];
}

async function fetchRSSFeed(url: string, brand: string, keywords: string[]): Promise<Mention[]> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'flomatai-social-monitor/0.1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];

    const xml = await response.text();
    const mentions: Mention[] = [];

    // Simple RSS parser — extract <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let id = 0;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1] ?? '';
      const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
                     item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? '';
      const link = (item.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ?? '';
      const desc = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ??
                    item.match(/<description>([\s\S]*?)<\/description>/))?.[1]
        ?.replace(/<[^>]+>/g, '').trim().substring(0, 300) ?? '';
      const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? new Date().toISOString();

      const text = `${title} ${desc}`.toLowerCase();
      const isRelevant = keywords.some((kw) => text.includes(kw.toLowerCase())) ||
                         text.includes(brand.toLowerCase());

      if (isRelevant && title) {
        mentions.push({
          id: `rss-${id++}`,
          source: `rss:${new URL(url).hostname}`,
          title,
          excerpt: desc,
          url: link,
          publishedAt: new Date(pubDate).toISOString(),
        });
      }
    }

    return mentions;
  } catch {
    return [];
  }
}

export const fetchMentionsSkill = TransformSkill.create({
  name: 'fetch-mentions',
  description: 'Fetches brand mentions from RSS feeds or returns mock data (--mock mode)',
  inputSchema: z.object({
    brand: z.string(),
    keywords: z.array(z.string()),
    rssFeeds: z.array(z.string()).optional(),
    mock: z.boolean().optional(),
  }),
  outputSchema: z.object({
    mentions: z.array(MentionSchema),
    sourceCount: z.number(),
    fetchedAt: z.string(),
  }),

  transform: async (input) => {
    const { brand, keywords, rssFeeds = [], mock = false } = input;

    if (mock || rssFeeds.length === 0) {
      const mentions = generateMockMentions(brand, keywords);
      return { mentions, sourceCount: 4, fetchedAt: new Date().toISOString() };
    }

    // Fetch all RSS feeds in parallel
    const results = await Promise.all(rssFeeds.map((url) => fetchRSSFeed(url, brand, keywords)));
    const mentions = results.flat();

    return {
      mentions,
      sourceCount: rssFeeds.length,
      fetchedAt: new Date().toISOString(),
    };
  },
});
