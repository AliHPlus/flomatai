/**
 * Skill: search-web
 *
 * Performs a web search using DuckDuckGo's HTML interface (no API key required).
 * Scrapes the result page and extracts title + snippet for each result.
 *
 * Note: This uses DuckDuckGo's non-JS HTML endpoint which is publicly accessible.
 * For production use, consider a proper search API (Serper, Tavily, Brave Search).
 */

import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

export const SearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
  resultCount: z.number(),
});

export type SearchOutput = z.infer<typeof SearchOutputSchema>;

export const searchWebSkill = TransformSkill.create({
  name: 'search-web',
  description: 'Searches the web using DuckDuckGo (no API key). Returns titles, URLs, and snippets.',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional(),
  }),
  outputSchema: SearchOutputSchema,

  transform: async (input) => {
    const { query, maxResults = 8 } = input;

    // DuckDuckGo HTML search (no JS, no API key)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    let html = '';
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; flomatai-research-agent/0.1)',
          'Accept': 'text/html',
        },
      });
      if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}`);
      }
      html = await response.text();
    } catch (err) {
      return {
        query,
        results: [],
        resultCount: 0,
      };
    }

    // Parse results from HTML using simple regex patterns
    // DDG result structure: <a class="result__a" href="...">title</a>
    //                       <a class="result__snippet">snippet</a>
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Extract result blocks
    const resultBlockRegex = /<div class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    let blockMatch;

    while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
      const block = blockMatch[1] ?? '';

      // Extract title and URL
      const linkMatch = block.match(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;

      const rawUrl = linkMatch[1] ?? '';
      const title = (linkMatch[2] ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .trim();

      if (!title) continue;

      // DDG wraps URLs — extract real URL from uddg parameter
      let finalUrl = rawUrl;
      try {
        const urlObj = new URL(rawUrl, 'https://html.duckduckgo.com');
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) finalUrl = decodeURIComponent(uddg);
      } catch {
        // Keep raw URL
      }

      // Extract snippet
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch
        ? (snippetMatch[1] ?? '')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim()
        : '';

      if (title && finalUrl) {
        results.push({ title, url: finalUrl, snippet });
      }
    }

    return { query, results, resultCount: results.length };
  },
});
