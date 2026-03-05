/**
 * Skill: scrape-page
 *
 * Fetches a web page and extracts the main text content.
 * Strips HTML tags, navigation, scripts, and boilerplate.
 */

import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const scrapePageSkill = TransformSkill.create({
  name: 'scrape-page',
  description: 'Fetches a URL and extracts readable text content (strips HTML, scripts, nav)',
  inputSchema: z.object({
    url: z.string(),
    maxChars: z.number().optional(),
  }),
  outputSchema: z.object({
    url: z.string(),
    title: z.string(),
    text: z.string(),
    charCount: z.number(),
    success: z.boolean(),
  }),

  transform: async (input) => {
    const { url, maxChars = 5000 } = input;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; flomatai-research-agent/0.1)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return { url, title: '', text: `HTTP ${response.status}`, charCount: 0, success: false };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return { url, title: '', text: 'Non-HTML content', charCount: 0, success: false };
      }

      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch
        ? titleMatch[1]!.replace(/\s+/g, ' ').trim().substring(0, 200)
        : '';

      // Strip boilerplate sections
      let cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      // Strip remaining HTML tags
      cleaned = cleaned.replace(/<[^>]+>/g, ' ');

      // Decode HTML entities
      cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ');

      // Normalize whitespace
      cleaned = cleaned
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 20) // keep only substantive lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .substring(0, maxChars);

      return {
        url,
        title,
        text: cleaned,
        charCount: cleaned.length,
        success: true,
      };
    } catch (err) {
      return {
        url,
        title: '',
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        charCount: 0,
        success: false,
      };
    }
  },
});
