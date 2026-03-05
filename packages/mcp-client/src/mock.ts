/**
 * MockMCPClient — deterministic MCP client for unit tests.
 *
 * No subprocess is spawned. Tools are registered in-memory and return
 * pre-configured responses. Mirrors the MockLLMProvider pattern from
 * @flomatai/core.
 *
 * @example
 * ```ts
 * import { MockMCPClient } from '@flomatai/mcp-client';
 * import { createTestOrchestrator } from '@flomatai/core';
 *
 * const mockMCP = new MockMCPClient([
 *   {
 *     name: 'read_file',
 *     description: 'Read a file',
 *     inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
 *     response: (args) => `contents of ${args['path']}`,
 *   },
 * ]);
 *
 * const orchestrator = new Orchestrator({
 *   llm: { default: createTestLLM() },
 *   mcp: { filesystem: mockMCP },
 * });
 * ```
 */

import type { MCPClientLike } from '@flomatai/core';
import type { MCPTool } from './types.js';

// ── Mock Tool Definition ──────────────────────────────────────────────────────

export interface MockMCPTool {
  /** Tool name. */
  name: string;
  /** Tool description. */
  description: string;
  /** JSON Schema for the input (used by listTools). */
  inputSchema: Record<string, unknown>;
  /**
   * The response to return when this tool is called.
   * Can be a static value or a function that receives the call arguments.
   *
   * If a function throws, the mock will propagate the error (simulating
   * an MCP tool error response).
   */
  response: unknown | ((args: Record<string, unknown>) => unknown | Promise<unknown>);
}

// ── MockMCPClient ─────────────────────────────────────────────────────────────

export class MockMCPClient implements MCPClientLike {
  private readonly tools: MockMCPTool[];
  private callLog: Array<{ name: string; args: Record<string, unknown> }> = [];

  constructor(tools: MockMCPTool[] = []) {
    this.tools = tools;
  }

  // ── MCPClientLike implementation ────────────────────────────────────────────

  async listTools(): Promise<MCPTool[]> {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.callLog.push({ name, args });

    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `MockMCPClient: tool "${name}" not found. ` +
        `Available: ${this.tools.map((t) => t.name).join(', ')}`,
      );
    }

    const { response } = tool;
    if (typeof response === 'function') {
      return (response as (args: Record<string, unknown>) => unknown | Promise<unknown>)(args);
    }
    return response;
  }

  // ── Test helpers ─────────────────────────────────────────────────────────────

  /** All tool calls made so far, in order. */
  get calls(): ReadonlyArray<{ name: string; args: Record<string, unknown> }> {
    return this.callLog;
  }

  /** Number of tool calls made. */
  get callCount(): number {
    return this.callLog.length;
  }

  /** Reset the call log. */
  reset(): void {
    this.callLog = [];
  }

  /** Return calls for a specific tool name. */
  callsFor(toolName: string): Array<{ name: string; args: Record<string, unknown> }> {
    return this.callLog.filter((c) => c.name === toolName);
  }
}
