/**
 * MCPRegistry — named registry of MCPClient instances (parallel to LLMRegistry).
 *
 * createMCPSkillsFromServer() auto-discovers all tools from a connected server
 * and returns them as an array of flomatai Skills. This is the fastest way to
 * give an agent access to every tool a server exposes.
 *
 * @example
 * ```ts
 * import { MCPClient, createMCPSkillsFromServer } from '@flomatai/mcp-client';
 * import { createAgent } from '@flomatai/core';
 *
 * const client = await connectMCPClient({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 *
 * const skills = await createMCPSkillsFromServer(client);
 *
 * const agent = createAgent({
 *   name: 'filesystem-agent',
 *   role: 'You manage files.',
 *   skills,
 *   strategy: 'react',
 * });
 * ```
 */

import type { Skill } from '@flomatai/core';
import type { MCPClientLike } from '@flomatai/core';
import { createMCPSkill } from './skill-factory.js';

// ── Registry type ─────────────────────────────────────────────────────────────

/**
 * Named registry of MCP clients.
 * Parallel to LLMRegistry from @flomatai/core.
 *
 * Pass this as `mcp` in OrchestratorConfig to make clients accessible via
 * SkillContext.getMCPClient(key).
 */
export type MCPRegistry = Record<string, MCPClientLike>;

// ── Auto-discovery ────────────────────────────────────────────────────────────

export interface CreateMCPSkillsOptions {
  /**
   * Only include tools with these names.
   * If provided, `exclude` is ignored.
   */
  only?: string[];
  /**
   * Exclude tools with these names.
   * Applied after `only` filtering.
   */
  exclude?: string[];
  /**
   * Prefix to prepend to each skill name.
   * Useful when multiple servers expose tools with the same name.
   * e.g. prefix='fs:' → skill name 'fs:read_file'
   */
  namePrefix?: string;
  /** Extra tags to add to every created skill. */
  tags?: string[];
}

/**
 * Auto-discover all tools exposed by a connected MCP server and return them
 * as an array of flomatai Skills, one per tool.
 *
 * The client must already be connected.
 */
export async function createMCPSkillsFromServer(
  client: MCPClientLike,
  options: CreateMCPSkillsOptions = {},
): Promise<Skill[]> {
  const tools = await client.listTools();

  let filtered = tools;

  if (options.only && options.only.length > 0) {
    const onlySet = new Set(options.only);
    filtered = filtered.filter((t) => onlySet.has(t.name));
  } else if (options.exclude && options.exclude.length > 0) {
    const excludeSet = new Set(options.exclude);
    filtered = filtered.filter((t) => !excludeSet.has(t.name));
  }

  return filtered.map((tool) =>
    createMCPSkill({
      client,
      toolName: tool.name,
      name: options.namePrefix ? `${options.namePrefix}${tool.name}` : tool.name,
      description: tool.description,
      tags: ['mcp', ...(options.tags ?? [])],
    }),
  );
}

// ── Resolve helper (parallel to resolveLLM) ───────────────────────────────────

/**
 * Resolve a named MCP client from a registry.
 * Throws a descriptive error if the key is not found.
 */
export function resolveMCPClient(registry: MCPRegistry, key: string): MCPClientLike {
  const client = registry[key];
  if (!client) {
    throw new Error(
      `MCP client "${key}" not found in registry. ` +
      `Available: ${Object.keys(registry).join(', ')}`,
    );
  }
  return client;
}
