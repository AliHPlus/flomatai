/**
 * @flomatai/bridge-python
 *
 * Python skill bridge for flomatai.
 * Spawns a Python subprocess and communicates via JSON over stdin/stdout.
 *
 * Protocol:
 *   TS → Python: writes JSON line: { "function": "fn_name", "input": {...}, "id": "uuid" }
 *   Python → TS: reads JSON line: { "id": "uuid", "output": {...} }
 *                              or: { "id": "uuid", "error": "message" }
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { z, type ZodSchema } from 'zod';
import { createTransformSkill } from '@flomatai/core';
import type { Skill, SkillContext } from '@flomatai/core';
import { SkillError } from '@flomatai/core';

// ── Python Skill Config ───────────────────────────────────────────────────────

export interface PythonSkillConfig<TInput, TOutput> {
  /** Unique skill name. */
  name: string;
  /** Description for agent routing. */
  description: string;
  /** Path to the Python script. */
  script: string;
  /** Python function name to call within the script. */
  function: string;
  /** Zod schema for input validation. */
  inputSchema: ZodSchema<TInput>;
  /** Zod schema for output validation. */
  outputSchema: ZodSchema<TOutput>;
  /** Python executable path. Default: 'python3' */
  pythonPath?: string;
  /** Additional environment variables to pass to Python. */
  env?: Record<string, string>;
  /** Timeout in ms. Default: 60000 */
  timeout?: number;
  /** Tags for categorization. */
  tags?: string[];
}

// ── PythonBridge (persistent process manager) ─────────────────────────────────

export class PythonBridge {
  private process: ChildProcess | null = null;
  private readonly scriptPath: string;
  private readonly pythonPath: string;
  private readonly env: Record<string, string>;
  private pending = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private buffer = '';

  constructor(config: {
    script: string;
    pythonPath?: string;
    env?: Record<string, string>;
  }) {
    this.scriptPath = config.script;
    this.pythonPath = config.pythonPath ?? 'python3';
    this.env = config.env ?? {};
  }

  start(): void {
    if (this.process) return;

    this.process = spawn(this.pythonPath, [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) this.handleResponse(line.trim());
      }
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      // Forward Python stderr to Node stderr for debugging
      process.stderr.write(`[python:${this.scriptPath}] ${chunk.toString()}`);
    });

    this.process.on('exit', (code) => {
      // Reject all pending calls
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Python process exited with code ${code}`));
        this.pending.delete(id);
      }
      this.process = null;
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }

  call(functionName: string, input: unknown, timeoutMs = 60_000): Promise<unknown> {
    if (!this.process) this.start();

    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const request = JSON.stringify({ id, function: functionName, input }) + '\n';

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Python call "${functionName}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      this.process!.stdin!.write(request, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`Failed to write to Python stdin: ${err.message}`));
        }
      });
    });
  }

  private handleResponse(line: string): void {
    let msg: { id: string; output?: unknown; error?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore non-JSON lines
    }

    const pending = this.pending.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.output);
    }
  }
}

// ── PythonSkill ───────────────────────────────────────────────────────────────

/**
 * Create a flomatai Skill that delegates execution to a Python function.
 *
 * The Python script must implement the flomatai bridge protocol.
 * Use the provided `flomatai_bridge.py` helper (in packages/bridge-python/python/).
 *
 * @example
 * ```ts
 * const analyticsSkill = PythonSkill.create({
 *   name: 'run-analytics',
 *   description: 'Runs pandas analytics on data',
 *   script: './skills/analytics.py',
 *   function: 'analyze',
 *   inputSchema: z.object({ data: z.array(z.any()) }),
 *   outputSchema: z.object({ result: z.any(), summary: z.string() }),
 * });
 * ```
 */
export function createPythonSkill<TInput, TOutput>(
  config: PythonSkillConfig<TInput, TOutput>,
): Skill<TInput, TOutput> {
  const bridge = new PythonBridge({
    script: config.script,
    pythonPath: config.pythonPath,
    env: config.env,
  });

  // Use a TransformSkill wrapper
  return createTransformSkill<TInput, TOutput>({
    name: config.name,
    description: config.description,
    tags: config.tags ?? ['python', 'io'],
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    timeout: config.timeout,
    async transform(input: TInput, _ctx?: SkillContext): Promise<TOutput> {
      try {
        const output = await bridge.call(config.function, input, config.timeout ?? 60_000);
        return output as TOutput;
      } catch (err) {
        throw new SkillError(
          config.name,
          `Python skill failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  });
}

/** Namespace export: PythonSkill.create(...) */
export const PythonSkill = { create: createPythonSkill };
