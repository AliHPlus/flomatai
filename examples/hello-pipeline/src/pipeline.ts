/**
 * Hello Pipeline — Example distributable pipeline.
 *
 * This demonstrates the FlomatAI pipeline package convention:
 * - Export `pipeline` (required)
 * - Export `metadata` (optional, for discovery)
 * - Export `configSchema` (optional, for configuration)
 *
 * Run: flomatai run hello-pipeline --input '{"name": "World"}'
 */

import { z } from 'zod';
import { Pipeline, TransformSkill } from '@flomatai/core';

// ── Config Schema ───────────────────────────────────────────────────────────

export const configSchema = z.object({
  /** Custom greeting prefix */
  greeting: z.string().default('Hello'),
  /** Number of times to repeat */
  repeat: z.number().min(1).max(10).default(1),
  /** Optional uppercase transform */
  uppercase: z.boolean().default(false),
});

// ── Skills ─────────────────────────────────────────────────────────────────

const greetSkill = TransformSkill.create({
  name: 'greet',
  description: 'Generate a greeting message',
  inputSchema: z.object({
    name: z.string(),
    greeting: z.string().default('Hello'),
    repeat: z.number().min(1).max(10).default(1),
    uppercase: z.boolean().default(false),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  transform: (input) => {
    let msg = `${input.greeting}, ${input.name}!`;
    if (input.uppercase) {
      msg = msg.toUpperCase();
    }
    // Repeat if needed
    const count = Math.max(1, Math.min(input.repeat ?? 1, 10));
    msg = Array(count).fill(msg).join('');
    return { message: msg };
  },
});

// ── Pipeline ───────────────────────────────────────────────────────────────

export const pipeline = Pipeline.create('hello-pipeline')
  .input(z.object({
    name: z.string(),
  }))

  .step('greet', greetSkill, {
    input: (ctx) => {
      const pi = ctx.pipelineInput as { name: string };
      const defaults = configSchema.parse({});
      return {
        name: pi.name,
        greeting: defaults.greeting,
        repeat: defaults.repeat,
        uppercase: defaults.uppercase,
      };
    },
  })

  .output(z.object({
    message: z.string(),
  }))

  .build();

// ── Metadata ───────────────────────────────────────────────────────────────

export const metadata = {
  name: 'hello-pipeline',
  description: 'A simple example pipeline that generates greeting messages',
  version: '0.1.0',
  tags: ['example', 'hello-world', 'basic'],
  author: 'FlomatAI Team',
  inputSchema: pipeline.inputSchema,
  outputSchema: pipeline.outputSchema,
};
