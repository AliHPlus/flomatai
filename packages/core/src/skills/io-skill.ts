/**
 * IOSkill — a skill that performs file, HTTP, or other IO operations.
 *
 * Thin wrapper around TransformSkill but with 'io' tag and
 * helper factories for common patterns.
 */

import { z, type ZodSchema } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { Skill, SkillContext } from '../skill.js';
import { createTransformSkill } from './transform-skill.js';

// ── HTTP GET ─────────────────────────────────────────────────────────────────

export function createHttpGetSkill(options: {
  name: string;
  description?: string;
  /** URL factory from input. */
  url: (input: Record<string, unknown>) => string;
  /** Headers factory from input. */
  headers?: (input: Record<string, unknown>) => Record<string, string>;
  /** Parse the response. Default: parse as JSON. */
  parseResponse?: (body: string, status: number) => unknown;
  timeout?: number;
  retries?: number;
}): Skill {
  return createTransformSkill({
    name: options.name,
    description: options.description ?? `HTTP GET skill: ${options.name}`,
    tags: ['io', 'http'],
    inputSchema: z.record(z.unknown()),
    outputSchema: z.unknown() as ZodSchema<unknown>,
    timeout: options.timeout,
    async transform(input) {
      const url = options.url(input);
      const headers = options.headers?.(input) ?? {};
      const res = await fetch(url, { headers });
      const body = await res.text();
      if (options.parseResponse) {
        return options.parseResponse(body, res.status);
      }
      try { return JSON.parse(body); } catch { return body; }
    },
  });
}

// ── HTTP POST ────────────────────────────────────────────────────────────────

export function createHttpPostSkill(options: {
  name: string;
  description?: string;
  url: (input: Record<string, unknown>) => string;
  body: (input: Record<string, unknown>) => unknown;
  headers?: (input: Record<string, unknown>) => Record<string, string>;
  parseResponse?: (body: string, status: number) => unknown;
  timeout?: number;
}): Skill {
  return createTransformSkill({
    name: options.name,
    description: options.description ?? `HTTP POST skill: ${options.name}`,
    tags: ['io', 'http'],
    inputSchema: z.record(z.unknown()),
    outputSchema: z.unknown() as ZodSchema<unknown>,
    timeout: options.timeout,
    async transform(input) {
      const url = options.url(input);
      const headers = { 'Content-Type': 'application/json', ...(options.headers?.(input) ?? {}) };
      const body = JSON.stringify(options.body(input));
      const res = await fetch(url, { method: 'POST', headers, body });
      const text = await res.text();
      if (options.parseResponse) {
        return options.parseResponse(text, res.status);
      }
      try { return JSON.parse(text); } catch { return text; }
    },
  });
}

// ── File Read ─────────────────────────────────────────────────────────────────

export function createReadFileSkill(options: {
  name: string;
  description?: string;
  path: (input: Record<string, unknown>) => string;
  encoding?: BufferEncoding;
}): Skill {
  return createTransformSkill({
    name: options.name,
    description: options.description ?? `Read file skill: ${options.name}`,
    tags: ['io', 'file'],
    inputSchema: z.record(z.unknown()),
    outputSchema: z.object({ content: z.string(), path: z.string() }),
    async transform(input) {
      const path = options.path(input);
      const content = await readFile(path, options.encoding ?? 'utf-8');
      return { content, path };
    },
  });
}

// ── File Write ────────────────────────────────────────────────────────────────

export function createWriteFileSkill(options: {
  name: string;
  description?: string;
  path: (input: Record<string, unknown>) => string;
  content: (input: Record<string, unknown>) => string;
  encoding?: BufferEncoding;
}): Skill {
  return createTransformSkill({
    name: options.name,
    description: options.description ?? `Write file skill: ${options.name}`,
    tags: ['io', 'file'],
    inputSchema: z.record(z.unknown()),
    outputSchema: z.object({ path: z.string(), bytesWritten: z.number() }),
    async transform(input) {
      const path = options.path(input);
      const content = options.content(input);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, options.encoding ?? 'utf-8');
      return { path, bytesWritten: Buffer.byteLength(content) };
    },
  });
}

/** Namespace export */
export const IOSkill = {
  httpGet: createHttpGetSkill,
  httpPost: createHttpPostSkill,
  readFile: createReadFileSkill,
  writeFile: createWriteFileSkill,
};
