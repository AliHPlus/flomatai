/**
 * Social Media Monitoring Pipeline
 *
 * Fetches brand mentions from RSS feeds (or mock data), classifies each mention
 * for sentiment/urgency, drafts responses for high-urgency items, and
 * generates a daily digest report.
 *
 * Pipeline graph:
 *   fetch-mentions
 *       ↓
 *   filter:relevance  (keep mentions with relevance >= minRelevance)
 *       ↓
 *   mapOver:mentions (concurrency=3) → classify-mention
 *       ↓
 *   [mapOver:urgent-mentions] → draft-response  (only for requiresResponse=true)
 *       ↓
 *   generate-digest
 *
 * Input:  { brand, keywords, rssFeeds?, mock?, minRelevance?, brandVoice? }
 * Output: { date, brand, totalMentions, sentimentBreakdown, urgentItems, ... }
 *
 * --mock mode: no network calls, uses realistic synthetic data
 */

import { z } from 'zod';
import { Pipeline, TransformSkill } from '@flomatai/core';
import { fetchMentionsSkill } from '../skills/fetch-mentions.js';
import { classifyMentionSkill } from '../skills/classify-mention.js';
import { draftResponseSkill } from '../skills/draft-response.js';
import { generateDigestSkill } from '../skills/generate-digest.js';

// Sub-pipeline: classify a single mention
const classifyPipeline = Pipeline.create('classify-single-mention')
  .step('classify', classifyMentionSkill, {
    input: (ctx) => {
      const mention = ctx.previousOutput as Record<string, unknown>;
      const pi = ctx.pipelineInput as { brand: string; keywords: string[] };
      return {
        mention,
        brand: pi.brand,
        keywords: pi.keywords,
      };
    },
  })
  .build();

// Sub-pipeline: draft a response for a high-priority mention
const draftPipeline = Pipeline.create('draft-single-response')
  .step('draft', draftResponseSkill, {
    input: (ctx) => {
      // previousOutput contains { mention, classification } merged by the prepare step
      const item = ctx.previousOutput as Record<string, unknown>;
      const pi = ctx.pipelineInput as { brand: string; brandVoice?: string };
      return {
        mention: item['mention'],
        classification: item['classification'],
        brand: pi.brand,
        brandVoice: pi.brandVoice,
      };
    },
  })
  .build();

// Skill: collect classify results and prepare urgent items for response drafting
const collectAndFilterSkill = TransformSkill.create({
  name: 'collect-and-filter-urgent',
  description: 'Collects classification results and prepares urgent items for response drafting',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    allClassifications: z.array(z.record(z.unknown())),
    urgentItems: z.array(z.record(z.unknown())),
  }),

  transform: (input) => {
    const inp = input as Record<string, unknown>;
    const classifyResults = inp['classifyResults'] as Array<Record<string, unknown>>;
    const mentions = inp['mentions'] as Array<Record<string, unknown>>;

    const allClassifications = classifyResults.map((r) => {
      return (r['classify'] ?? r) as Record<string, unknown>;
    });

    // Find urgent items that require a response
    const urgentItems = allClassifications
      .filter((c) => c['requiresResponse'] === true &&
        (c['urgency'] === 'high' || c['urgency'] === 'critical' || c['urgency'] === 'medium'))
      .map((c) => {
        const mention = mentions.find((m) => m['id'] === c['id']);
        return { mention, classification: c };
      })
      .filter((item) => item.mention != null);

    return { allClassifications, urgentItems };
  },
});

// Skill: assemble everything for the digest
const assembleDigestInputSkill = TransformSkill.create({
  name: 'assemble-digest-input',
  description: 'Assembles all data for the digest generation step',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  transform: (input) => input,
});

export const socialMonitoringPipeline = Pipeline.create('social-monitoring')
  .input(z.object({
    brand: z.string(),
    keywords: z.array(z.string()),
    rssFeeds: z.array(z.string()).optional(),
    mock: z.boolean().optional(),
    minRelevance: z.number().optional(),
    brandVoice: z.string().optional(),
  }))

  // Step 1: Fetch all mentions (RSS or mock)
  .step('fetch', fetchMentionsSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as {
        brand: string;
        keywords: string[];
        rssFeeds?: string[];
        mock?: boolean;
      };
      return {
        brand: pi.brand,
        keywords: pi.keywords,
        rssFeeds: pi.rssFeeds,
        mock: pi.mock,
      };
    },
  })

  // Step 2: Classify all mentions in parallel (concurrency=3)
  .mapOver('mentions', classifyPipeline, {
    concurrency: 3,
    onItemError: 'skip',
    name: 'classify-all',
  })

  // Step 3: Collect classifications, find urgent items needing responses
  .step('collect', collectAndFilterSkill, {
    input: (ctx) => {
      const fetchOutput = ctx.stepOutputs['fetch'] as { mentions: Array<Record<string, unknown>> };
      return {
        classifyResults: ctx.previousOutput as Array<Record<string, unknown>>,
        mentions: fetchOutput.mentions,
      };
    },
  })

  // Step 4: Draft responses for urgent/requiring-response mentions
  .mapOver('urgentItems', draftPipeline, {
    concurrency: 2,
    onItemError: 'skip',
    name: 'draft-responses',
  })

  // Step 5: Generate daily digest
  .step('digest', generateDigestSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { brand: string };
      const fetchOutput = ctx.stepOutputs['fetch'] as { mentions: Array<Record<string, unknown>> };
      const collectOutput = ctx.stepOutputs['collect'] as {
        allClassifications: Array<Record<string, unknown>>;
      };
      const draftResults = ctx.previousOutput as Array<Record<string, unknown>>;
      const drafts = draftResults.map((r) => (r['draft'] ?? r) as Record<string, unknown>);

      return {
        brand: pi.brand,
        mentions: fetchOutput.mentions,
        classifications: collectOutput.allClassifications,
        drafts,
        date: new Date().toISOString().split('T')[0],
      };
    },
  })

  .output(z.object({
    date: z.string(),
    brand: z.string(),
    totalMentions: z.number(),
    sentimentBreakdown: z.record(z.number()),
    urgentItems: z.array(z.record(z.unknown())),
    executiveSummary: z.string(),
    topThemes: z.array(z.string()),
    recommendations: z.array(z.string()),
  }))

  .build();
