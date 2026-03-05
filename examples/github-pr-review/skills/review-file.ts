/**
 * Skill: review-file
 *
 * Reviews a single changed file's diff and returns structured feedback.
 * This is the per-item skill used inside the mapOver step (concurrency=3).
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const FileReviewSchema = z.object({
  filename: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  summary: z.string(),
  comments: z.array(z.object({
    line: z.number().optional(),
    body: z.string(),
    severity: z.enum(['info', 'warning', 'error']),
  })),
  approved: z.boolean(),
});

export type FileReview = z.infer<typeof FileReviewSchema>;

export const reviewFileSkill = LLMSkill.create({
  name: 'review-file',
  description: 'Reviews a single file diff and produces structured code review feedback',
  llm: 'default',

  inputSchema: z.object({
    filename: z.string(),
    status: z.string(),
    additions: z.number(),
    deletions: z.number(),
    patch: z.string().optional(),
    prTitle: z.string(),
    prBody: z.string(),
  }),
  outputSchema: FileReviewSchema,

  systemMessage: `You are an expert code reviewer. Analyze the provided file diff carefully.
Focus on: bugs, security issues, performance problems, naming clarity, missing error handling.
Do NOT comment on style preferences unless they cause real problems.
Be concise and actionable. Output ONLY valid JSON.`,

  prompt: (input) => `Review this file change:

File: ${input.filename}
Status: ${input.status} (+${input.additions}/-${input.deletions})
PR: "${input.prTitle}"
${input.prBody ? `Context: ${input.prBody.substring(0, 500)}` : ''}

Diff:
\`\`\`diff
${input.patch ?? '(binary file or no diff available)'}
\`\`\`

Output ONLY valid JSON:
{
  "filename": "${input.filename}",
  "severity": "info|warning|error",
  "summary": "1-2 sentence summary of findings",
  "comments": [
    { "line": 42, "body": "specific issue", "severity": "warning" }
  ],
  "approved": true
}

If there are no issues, set severity to "info", comments to [], and approved to true.`,

  parseOutput: (raw, input) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as FileReview;
      return { ...parsed, filename: input.filename };
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return {
          filename: input.filename,
          severity: 'info' as const,
          summary: 'Could not parse review output',
          comments: [],
          approved: true,
        };
      }
      const parsed = JSON.parse(match[0]) as FileReview;
      return { ...parsed, filename: input.filename };
    }
  },

  llmOptions: { temperature: 0.1, maxTokens: 2048 },
  retries: 2,
});
