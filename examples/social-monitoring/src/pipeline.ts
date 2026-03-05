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
// Each item passed to this sub-pipeline is already enriched:
//   { mention, brand, keywords }
// because mapOver passes the item as both pipelineInput AND previousOutput,
// but the parent pipeline's pipelineInput is NOT forwarded.
const classifyPipeline = Pipeline.create('classify-single-mention')
  .step('classify', classifyMentionSkill, {
    input: (ctx) => {
      // item = { mention, brand, keywords } — enriched before mapOver
      const item = ctx.previousOutput as { mention: Record<string, unknown>; brand: string; keywords: string[] };
      return {
        mention: item.mention,
        brand: item.brand,
        keywords: item.keywords,
      };
    },
  })
  .build();

// Sub-pipeline: draft a response for a high-priority mention
// Each item passed to this sub-pipeline is already enriched:
//   { mention, classification, brand, brandVoice? }
const draftPipeline = Pipeline.create('draft-single-response')
  .step('draft', draftResponseSkill, {
    input: (ctx) => {
      // item = { mention, classification, brand, brandVoice? } — enriched before mapOver
      const item = ctx.previousOutput as { mention: Record<string, unknown>; classification: Record<string, unknown>; brand: string; brandVoice?: string };
      return {
        mention: item.mention,
        classification: item.classification,
        brand: item.brand,
        brandVoice: item.brandVoice,
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

// Skill: enrich mentions with brand/keywords so sub-pipelines can access them
// mapOver passes each item as the sub-pipeline's pipelineInput, NOT the parent's pipelineInput
const enrichMentionsSkill = TransformSkill.create({
  name: 'enrich-mentions',
  description: 'Embeds brand and keywords into each mention item for sub-pipeline access',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    enrichedMentions: z.array(z.record(z.unknown())),
  }),
  transform: (input) => {
    const inp = input as { mentions: Array<Record<string, unknown>>; brand: string; keywords: string[] };
    const enrichedMentions = inp.mentions.map((m) => ({
      mention: m,
      brand: inp.brand,
      keywords: inp.keywords,
    }));
    return { enrichedMentions };
  },
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

  // Step 2: Enrich mentions with brand/keywords so sub-pipelines can access them
  // (mapOver only passes the item as the sub-pipeline input, not the parent pipelineInput)
  .step('enrich', enrichMentionsSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { brand: string; keywords: string[] };
      const fetchOutput = ctx.stepOutputs['fetch'] as { mentions: Array<Record<string, unknown>> };
      return {
        mentions: fetchOutput.mentions,
        brand: pi.brand,
        keywords: pi.keywords,
      };
    },
  })

  // Step 3: Classify all mentions in parallel (concurrency=3)
  // Each item is { mention, brand, keywords } — brand/keywords are embedded
  .mapOver('enrichedMentions', classifyPipeline, {
    concurrency: 3,
    onItemError: 'skip',
    name: 'classify-all',
  })

  // Step 4: Collect classifications, find urgent items needing responses
  .step('collect', collectAndFilterSkill, {
    input: (ctx) => {
      const fetchOutput = ctx.stepOutputs['fetch'] as { mentions: Array<Record<string, unknown>> };
      return {
        classifyResults: ctx.previousOutput as Array<Record<string, unknown>>,
        mentions: fetchOutput.mentions,
      };
    },
  })

  // Step 5: Enrich urgent items with brand/brandVoice for the draft sub-pipeline
  .step('enrich-urgent', TransformSkill.create({
    name: 'enrich-urgent-items',
    description: 'Embeds brand and brandVoice into each urgent item for draft sub-pipeline access',
    inputSchema: z.record(z.unknown()),
    outputSchema: z.object({ urgentItems: z.array(z.record(z.unknown())) }),
    transform: (input) => {
      const inp = input as {
        allClassifications: Array<Record<string, unknown>>;
        urgentItems: Array<{ mention: Record<string, unknown>; classification: Record<string, unknown> }>;
        brand?: string;
        brandVoice?: string;
      };
      const urgentItems = inp.urgentItems.map((item) => ({
        mention: item.mention,
        classification: item.classification,
        brand: inp.brand,
        brandVoice: inp.brandVoice,
      }));
      return { urgentItems };
    },
  }), {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { brand: string; brandVoice?: string };
      const collectOutput = ctx.stepOutputs['collect'] as {
        allClassifications: Array<Record<string, unknown>>;
        urgentItems: Array<{ mention: Record<string, unknown>; classification: Record<string, unknown> }>;
      };
      return {
        ...collectOutput,
        brand: pi.brand,
        brandVoice: pi.brandVoice,
      };
    },
  })

  // Step 6: Draft responses for urgent/requiring-response mentions
  // Each item is { mention, classification, brand, brandVoice? } — all context embedded
  .mapOver('urgentItems', draftPipeline, {
    concurrency: 2,
    onItemError: 'skip',
    name: 'draft-responses',
  })

  // Step 7: Generate daily digest
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
