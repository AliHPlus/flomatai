/**
 * createMCPSkill — wraps a single MCP tool as a flomatai Skill.
 *
 * The resulting Skill can be passed to any Agent, Pipeline, or strategy
 * exactly like any other flomatai Skill.
 *
 * @example
 * ```ts
 * import { createMCPSkill, MCPClient } from '@flomatai/mcp-client';
 *
 * const client = await connectMCPClient({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 *
 * const readFileSkill = createMCPSkill({
 *   client,
 *   toolName: 'read_file',
 * });
 * ```
 */

import { z, type ZodSchema } from 'zod';
import type { Skill, SkillContext } from '@flomatai/core';
import { SkillError } from '@flomatai/core';
import type { MCPClientLike } from '@flomatai/core';

// ── Config ────────────────────────────────────────────────────────────────────

export interface MCPSkillConfig {
  /**
   * The MCP client to call the tool on.
   * Must be connected before the skill executes.
   */
  client: MCPClientLike;
  /** The tool name as declared by the MCP server. */
  toolName: string;
  /**
   * Override the skill name. Defaults to the toolName.
   * Useful when multiple clients expose a tool with the same name.
   */
  name?: string;
  /**
   * Override the skill description. Defaults to the tool's description
   * from the MCP server.
   * When provided, the server is not queried for the description.
   */
  description?: string;
  /**
   * Input Zod schema for runtime validation.
   * @default z.record(z.unknown()) — accepts any object
   */
  inputSchema?: ZodSchema;
  /**
   * Output Zod schema for runtime validation.
   * @default z.unknown() — accepts anything
   */
  outputSchema?: ZodSchema;
  /** Per-execution timeout in milliseconds. */
  timeout?: number;
  /** Number of retries on failure. */
  retries?: number;
  /** Tags for categorization. */
  tags?: string[];
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Wrap a single MCP tool as a flomatai Skill.
 *
 * The skill calls `client.callTool(toolName, input)` on execute.
 * If the client is not connected the execute call will throw.
 */
export function createMCPSkill(config: MCPSkillConfig): Skill {
  const skillName = config.name ?? config.toolName;
  const inputSchema = config.inputSchema ?? (z.record(z.unknown()) as ZodSchema);
  const outputSchema = config.outputSchema ?? (z.unknown() as ZodSchema);

  const skill: Skill = {
    meta: {
      name: skillName,
      // Description may be overridden or resolved lazily; start with a placeholder
      description: config.description ?? `MCP tool: ${config.toolName}`,
      tags: config.tags ?? ['mcp'],
      retries: config.retries,
      timeout: config.timeout,
    },
    inputSchema,
    outputSchema,

    async execute(input: unknown, _ctx: SkillContext): Promise<unknown> {
      try {
        const args = (input ?? {}) as Record<string, unknown>;
        return await config.client.callTool(config.toolName, args);
      } catch (err) {
        throw new SkillError(
          skillName,
          `MCP tool call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };

  return skill;
}

// ── Description resolver (async, for ergonomic use) ──────────────────────────

/**
 * Same as createMCPSkill but queries the server for the tool's description.
 * Use this when you don't want to hard-code descriptions and the client is
 * already connected.
 */
export async function createMCPSkillWithDescription(
  config: MCPSkillConfig,
): Promise<Skill> {
  if (!config.description) {
    const tools = await config.client.listTools();
    const tool = tools.find((t) => t.name === config.toolName);
    if (tool) {
      config = { ...config, description: tool.description };
    }
  }
  return createMCPSkill(config);
}
