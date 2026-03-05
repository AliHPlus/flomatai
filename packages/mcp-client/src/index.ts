/**
 * @flomatai/mcp-client — public API
 *
 * Connect flomatai to MCP (Model Context Protocol) servers.
 * Wrap their tools as native flomatai Skills usable by any Agent or Pipeline.
 *
 * Quick start:
 * ```ts
 * import { connectMCPClient, createMCPSkillsFromServer } from '@flomatai/mcp-client';
 * import { createAgent, Orchestrator, MemoryStore } from '@flomatai/core';
 * import { resolveLLMFromEnv } from '@flomatai/helpers';
 *
 * // 1. Connect to an MCP server
 * const fsClient = await connectMCPClient({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 *
 * // 2. Auto-discover all tools as Skills
 * const skills = await createMCPSkillsFromServer(fsClient);
 *
 * // 3. Build a ReAct agent with those skills
 * const agent = createAgent({
 *   name: 'filesystem-agent',
 *   role: 'You manage files on the local filesystem.',
 *   skills,
 *   strategy: 'react',
 * });
 *
 * // 4. Wire up the orchestrator (MCP client in the registry for skills that need it)
 * const orchestrator = new Orchestrator({
 *   llm: { default: resolveLLMFromEnv() },
 *   mcp: { filesystem: fsClient },
 *   state: new MemoryStore(),
 * });
 *
 * // 5. Cleanup when done
 * await fsClient.disconnect();
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type { MCPTool, MCPCallResult, MCPContentBlock, StdioServerConfig } from './types.js';

// ── Client ────────────────────────────────────────────────────────────────────
export { MCPClient, connectMCPClient } from './client.js';

// ── Skill factory ─────────────────────────────────────────────────────────────
export {
  createMCPSkill,
  createMCPSkillWithDescription,
  type MCPSkillConfig,
} from './skill-factory.js';

// ── Registry & auto-discovery ─────────────────────────────────────────────────
export {
  createMCPSkillsFromServer,
  resolveMCPClient,
  type MCPRegistry,
  type CreateMCPSkillsOptions,
} from './registry.js';

// ── Testing / Mock ────────────────────────────────────────────────────────────
export { MockMCPClient, type MockMCPTool } from './mock.js';
