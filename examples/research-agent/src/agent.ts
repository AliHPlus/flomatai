/**
 * Research Agent
 *
 * An autonomous research agent that uses the ReAct (Reasoning + Acting) strategy
 * to iteratively search the web, scrape pages, extract facts, and synthesize a report.
 *
 * The agent decides on its own what to search for, which pages to scrape,
 * and when it has enough information to write the final report.
 *
 * Skills available to the agent:
 *   - search-web:        DuckDuckGo search (no API key)
 *   - scrape-page:       Fetch and extract text from a URL
 *   - extract-facts:     Extract relevant facts from scraped text
 *   - synthesize-report: Write the final research report
 *
 * Strategy: ReAct (iterative Thought → Action → Observation loop)
 */

import { createAgent } from '@flomatai/core';
import { searchWebSkill } from '../skills/search-web.js';
import { scrapePageSkill } from '../skills/scrape-page.js';
import { extractFactsSkill } from '../skills/extract-facts.js';
import { synthesizeReportSkill } from '../skills/synthesize-report.js';

export function createResearchAgent(maxIterations = 8) {
  return createAgent({
    name: 'research-agent',

    role: `You are an autonomous research agent. Your goal is to research a given topic thoroughly
and produce a comprehensive, well-sourced report.

Your research process:
1. Break down the topic into key aspects to research
2. Search for each aspect using search-web
3. For promising results, use scrape-page to get full content
4. Use extract-facts to pull relevant facts from each page
5. When you have gathered sufficient facts (at least 10-15 from multiple sources), use synthesize-report
6. Aim for breadth: search for multiple angles on the topic
7. Do NOT scrape more than 6 pages total (to keep costs manageable)

You have access to: search-web, scrape-page, extract-facts, synthesize-report.
Use synthesize-report as your FINAL action only.`,

    skills: [
      searchWebSkill,
      scrapePageSkill,
      extractFactsSkill,
      synthesizeReportSkill,
    ],

    strategy: 'react',

    reactOptions: {
      maxIterations,
      reflectionInterval: 4, // reflect every 4 steps to avoid loops
      systemPromptSuffix: `
Research guidelines:
- Start with broad searches, then narrow to specific aspects
- Use extract-facts after each scrape (pass the topic for relevance filtering)
- Keep track of what you've already searched/scraped
- Synthesize when you have 10+ relevant facts from 3+ sources`,
    },
  });
}
