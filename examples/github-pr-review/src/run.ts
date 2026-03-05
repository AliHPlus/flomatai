/**
 * GitHub PR Review Pipeline — runner script.
 *
 * Usage:
 *   node dist/src/run.js --owner microsoft --repo vscode --pr 12345
 *   GITHUB_TOKEN=ghp_xxx node dist/src/run.js --owner org --repo repo --pr 1
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub Personal Access Token (required)
 *   ANTHROPIC_API_KEY or OPENAI_API_KEY — LLM provider key (required)
 *   OPENCODE_BASE_URL — use local OpenCode proxy instead of direct API
 */

import { githubPRReviewPipeline } from './pipeline.js';
import { orchestrator } from './orchestrator.js';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const owner = getArg('--owner') ?? process.env['GITHUB_OWNER'];
  const repo = getArg('--repo') ?? process.env['GITHUB_REPO'];
  const prStr = getArg('--pr') ?? process.env['GITHUB_PR'];

  if (!owner || !repo || !prStr) {
    console.error('Usage: node dist/src/run.js --owner <owner> --repo <repo> --pr <number>');
    console.error('Or set: GITHUB_OWNER, GITHUB_REPO, GITHUB_PR env vars');
    process.exit(1);
  }

  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber)) {
    console.error(`Invalid PR number: ${prStr}`);
    process.exit(1);
  }

  console.log(`\nReviewing PR #${prNumber} in ${owner}/${repo}`);

  try {
    const { output, run } = await orchestrator.run(githubPRReviewPipeline, {
      owner,
      repo,
      prNumber,
      token,
    });

    const result = output as {
      reviewId: number;
      url: string;
      state: string;
      filesReviewed: number;
      issuesFound: number;
      approved: boolean;
    };

    console.log('\n── Review Posted ──────────────────────────────────');
    console.log(`  Review ID:     ${result.reviewId}`);
    console.log(`  State:         ${result.state}`);
    console.log(`  Files reviewed: ${result.filesReviewed}`);
    console.log(`  Issues found:   ${result.issuesFound}`);
    console.log(`  Approved:       ${result.approved}`);
    console.log(`  URL:           ${result.url}`);
    console.log(`  Run ID:        ${run.id}`);
    console.log('──────────────────────────────────────────────────');
  } catch (err) {
    console.error('\nPipeline failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
