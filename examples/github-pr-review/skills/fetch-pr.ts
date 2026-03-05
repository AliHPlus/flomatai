/**
 * Skill: fetch-pr
 *
 * Fetches PR metadata and the unified diff from the GitHub API.
 * Returns a list of changed files with their diffs ready for review.
 */

import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const PRFileSchema = z.object({
  filename: z.string(),
  status: z.string(),           // added | modified | removed | renamed
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(), // unified diff — may be absent for binary files
  sha: z.string(),
});

export const PRMetaSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string(),
  base: z.string(),
  head: z.string(),
  author: z.string(),
  files: z.array(PRFileSchema),
  commitSha: z.string(),
});

export type PRMeta = z.infer<typeof PRMetaSchema>;
export type PRFile = z.infer<typeof PRFileSchema>;

export const fetchPRSkill = TransformSkill.create({
  name: 'fetch-pr',
  description: 'Fetches PR metadata and file diffs from GitHub API',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    token: z.string(),
  }),
  outputSchema: PRMetaSchema,

  transform: async (input) => {
    const { owner, repo, prNumber, token } = input;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'flomatai-pr-review/0.1',
    };
    const base = `https://api.github.com/repos/${owner}/${repo}`;

    // Fetch PR metadata
    const prRes = await fetch(`${base}/pulls/${prNumber}`, { headers });
    if (!prRes.ok) {
      throw new Error(`GitHub API error ${prRes.status}: ${await prRes.text()}`);
    }
    const pr = await prRes.json() as Record<string, unknown>;

    // Fetch changed files
    const filesRes = await fetch(`${base}/pulls/${prNumber}/files?per_page=100`, { headers });
    if (!filesRes.ok) {
      throw new Error(`GitHub files API error ${filesRes.status}: ${await filesRes.text()}`);
    }
    const files = await filesRes.json() as Array<Record<string, unknown>>;

    return {
      number: prNumber,
      title: String((pr['title'] as string) ?? ''),
      body: String((pr['body'] as string) ?? ''),
      base: String(((pr['base'] as Record<string, unknown>)?.['label']) ?? ''),
      head: String(((pr['head'] as Record<string, unknown>)?.['label']) ?? ''),
      author: String(((pr['user'] as Record<string, unknown>)?.['login']) ?? ''),
      commitSha: String(((pr['head'] as Record<string, unknown>)?.['sha']) ?? ''),
      files: files.map((f) => ({
        filename: String(f['filename'] ?? ''),
        status: String(f['status'] ?? 'modified'),
        additions: Number(f['additions'] ?? 0),
        deletions: Number(f['deletions'] ?? 0),
        patch: f['patch'] ? String(f['patch']) : undefined,
        sha: String(f['sha'] ?? ''),
      })),
    };
  },
});
