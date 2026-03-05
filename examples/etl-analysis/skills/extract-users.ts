/**
 * Skill: extract-users
 *
 * Extracts user data from a JSON file (or uses bundled synthetic data).
 */

import { readFile } from 'fs/promises';
import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

const UserRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.string(),
  signup_date: z.string(),
  region: z.string(),
  active: z.boolean(),
  sessions_last_30d: z.number(),
  spend_lifetime: z.number(),
});

export type UserRecord = z.infer<typeof UserRecordSchema>;

export const extractUsersSkill = TransformSkill.create({
  name: 'extract-users',
  description: 'Extracts and validates user JSON data',
  inputSchema: z.object({
    filePath: z.string(),
  }),
  outputSchema: z.object({
    users: z.array(UserRecordSchema),
    source: z.string(),
    userCount: z.number(),
  }),

  transform: async (input) => {
    const text = await readFile(input.filePath, 'utf-8');
    const raw = JSON.parse(text) as Array<Record<string, unknown>>;

    const users: UserRecord[] = raw.map((u) => ({
      id: String(u['id'] ?? ''),
      name: String(u['name'] ?? ''),
      plan: String(u['plan'] ?? 'basic'),
      signup_date: String(u['signup_date'] ?? ''),
      region: String(u['region'] ?? ''),
      active: Boolean(u['active'] ?? false),
      sessions_last_30d: Number(u['sessions_last_30d'] ?? 0),
      spend_lifetime: Number(u['spend_lifetime'] ?? 0),
    }));

    return { users, source: input.filePath, userCount: users.length };
  },
});
