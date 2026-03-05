/**
 * GitHub PR Review — test runner using MockLLMProvider + mock GitHub API.
 *
 * We mock the GitHub API by using a TransformSkill that returns fake PR data
 * instead of calling the real API.
 */

import { createTestOrchestrator, Pipeline, TransformSkill } from '@flomatai/core';
import { z } from 'zod';
import { reviewFileSkill } from '../skills/review-file.js';
import { postReviewSkill } from '../skills/post-review.js';

// Mock fetch-pr skill that returns fake data (no real GitHub API call)
const mockFetchPRSkill = TransformSkill.create({
  name: 'fetch-pr',
  description: 'Mock fetch-pr skill',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  transform: () => ({
    number: 42,
    title: 'Fix: improve error handling',
    body: 'This PR improves error handling in the auth service.',
    base: 'main',
    head: 'fix/error-handling',
    author: 'test-user',
    commitSha: 'abc123def456',
    files: [
      {
        filename: 'src/auth.ts',
        status: 'modified',
        additions: 15,
        deletions: 5,
        patch: '@@ -10,5 +10,15 @@\n-  throw new Error("bad");\n+  throw new AuthError("Invalid credentials", 401);',
        sha: 'file123',
      },
      {
        filename: 'src/utils.ts',
        status: 'added',
        additions: 20,
        deletions: 0,
        patch: '@@ -0,0 +1,20 @@\n+export function safeJson(str: string) {\n+  try { return JSON.parse(str); } catch { return null; }\n+}',
        sha: 'file456',
      },
    ],
  }),
});

// Mock post-review skill (no real GitHub API call)
const mockPostReviewSkill = TransformSkill.create({
  name: 'post-review',
  description: 'Mock post-review skill',
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  transform: (input) => {
    const inp = input as Record<string, unknown>;
    const reviews = (inp['reviews'] as Array<Record<string, unknown>>) ?? [];
    return {
      reviewId: 99999,
      url: 'https://github.com/test/repo/pull/42#pullrequestreview-99999',
      state: 'APPROVE',
      filesReviewed: reviews.length,
      issuesFound: 0,
      approved: true,
    };
  },
});

// Sub-pipeline for per-file review
const reviewFilePipeline = Pipeline.create('review-single-file')
  .step('review', reviewFileSkill, {
    input: (ctx) => {
      const file = ctx.previousOutput as Record<string, unknown>;
      const pipelineInput = ctx.pipelineInput as Record<string, unknown>;
      return {
        filename: file['filename'],
        status: file['status'],
        additions: file['additions'],
        deletions: file['deletions'],
        patch: file['patch'],
        prTitle: pipelineInput['prTitle'] ?? 'Test PR',
        prBody: pipelineInput['prBody'] ?? '',
      };
    },
  })
  .build();

// Test pipeline using mock skills
const testPipeline = Pipeline.create('github-pr-review-test')
  .input(z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    token: z.string(),
  }))
  .step('fetch', mockFetchPRSkill, {
    input: (ctx) => ctx.pipelineInput,
  })
  .mapOver('files', reviewFilePipeline, {
    concurrency: 2,
    onItemError: 'skip',
    name: 'review-all-files',
  })
  .step('post', mockPostReviewSkill, {
    input: (ctx) => {
      const fetchOutput = ctx.stepOutputs['fetch'] as Record<string, unknown>;
      const reviewResults = ctx.previousOutput as Array<Record<string, unknown>>;
      const reviews = reviewResults.map((r) => (r['review'] ?? r) as unknown);
      return {
        owner: (ctx.pipelineInput as Record<string, unknown>)['owner'],
        repo: (ctx.pipelineInput as Record<string, unknown>)['repo'],
        prNumber: (ctx.pipelineInput as Record<string, unknown>)['prNumber'],
        commitSha: fetchOutput['commitSha'],
        token: (ctx.pipelineInput as Record<string, unknown>)['token'],
        prTitle: fetchOutput['title'],
        reviews,
      };
    },
  })
  .build();

async function runTest() {
  console.log('=== GitHub PR Review — Test ===\n');

  const orchestrator = createTestOrchestrator();
  const { output, run } = await orchestrator.run(testPipeline, {
    owner: 'test-org',
    repo: 'test-repo',
    prNumber: 42,
    token: 'fake-token',
  });

  const result = output as {
    reviewId: number;
    url: string;
    state: string;
    filesReviewed: number;
    approved: boolean;
  };

  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:       ${run.id}`);
  console.log(`  Review ID:    ${result.reviewId}`);
  console.log(`  State:        ${result.state}`);
  console.log(`  Files reviewed: ${result.filesReviewed}`);
  console.log(`  Approved:     ${result.approved}`);

  if (result.filesReviewed < 1) throw new Error('no files reviewed');

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
