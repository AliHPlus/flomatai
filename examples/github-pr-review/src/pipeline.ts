/**
 * GitHub PR Review Pipeline
 *
 * Fetches a pull request from GitHub, reviews each changed file in parallel
 * (concurrency=3), then posts a single consolidated review back to GitHub.
 *
 * Pipeline graph:
 *   fetch-pr → [map:files (concurrency=3) → review-file] → post-review
 *
 * Input:  { owner, repo, prNumber, token }
 * Output: { reviewId, url, state, filesReviewed, issuesFound, approved }
 */

import { z } from 'zod';
import { Pipeline, TransformSkill } from '@flomatai/core';
import { fetchPRSkill } from '../skills/fetch-pr.js';
import { reviewFileSkill } from '../skills/review-file.js';
import { postReviewSkill } from '../skills/post-review.js';

// Sub-pipeline: review a single file (used inside mapOver)
const reviewFilePipeline = Pipeline.create('review-single-file')
  .step('review', reviewFileSkill, {
    input: (ctx) => {
      // ctx.previousOutput is the individual PRFile item from the array
      const file = ctx.previousOutput as Record<string, unknown>;
      // We need prTitle and prBody from the root pipeline input
      const pipelineInput = ctx.pipelineInput as Record<string, unknown>;
      return {
        filename: file['filename'],
        status: file['status'],
        additions: file['additions'],
        deletions: file['deletions'],
        patch: file['patch'],
        prTitle: pipelineInput['prTitle'] ?? '',
        prBody: pipelineInput['prBody'] ?? '',
      };
    },
  })
  .build();

// Skill: prepare the post-review input from accumulated pipeline state
const preparePostReviewSkill = TransformSkill.create({
  name: 'prepare-post-review',
  description: 'Collects all file reviews and pipeline context for the post-review step',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  transform: (input) => input,
});

// Main pipeline
export const githubPRReviewPipeline = Pipeline.create('github-pr-review')
  .input(z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    token: z.string(),
  }))

  // Step 1: Fetch PR metadata and all changed files
  .step('fetch', fetchPRSkill, {
    input: (ctx) => ctx.pipelineInput,
  })

  // Step 2: Review each file in parallel (up to 3 concurrent LLM calls)
  .mapOver('files', reviewFilePipeline, {
    concurrency: 3,
    onItemError: 'skip',
    name: 'review-all-files',
  })

  // Step 3: Post the consolidated review to GitHub
  .step('post', postReviewSkill, {
    input: (ctx) => {
      const pipelineInput = ctx.pipelineInput as {
        owner: string;
        repo: string;
        prNumber: number;
        token: string;
      };
      const fetchOutput = ctx.stepOutputs['fetch'] as {
        commitSha: string;
        title: string;
        files: unknown[];
      };
      // mapOver outputs an array of sub-pipeline results; each result has the review step output
      const reviewResults = ctx.previousOutput as Array<Record<string, unknown>>;
      const reviews = reviewResults.map((r) => {
        // Sub-pipeline wraps step output under the step name
        return (r['review'] ?? r) as unknown;
      });

      return {
        owner: pipelineInput.owner,
        repo: pipelineInput.repo,
        prNumber: pipelineInput.prNumber,
        commitSha: fetchOutput.commitSha,
        token: pipelineInput.token,
        prTitle: fetchOutput.title,
        reviews,
      };
    },
  })

  .output(z.object({
    reviewId: z.number(),
    url: z.string(),
    state: z.string(),
    filesReviewed: z.number(),
    issuesFound: z.number(),
    approved: z.boolean(),
  }))

  .build();
