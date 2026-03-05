/**
 * MCPClient — connects to a local MCP server via stdio and exposes its tools.
 *
 * Uses the official @modelcontextprotocol/sdk Client + StdioClientTransport.
 *
 * Implements the MCPClientLike interface from @flomatai/core so it can be
 * registered directly in OrchestratorConfig.mcp.
 *
 * @example
 * ```ts
 * import { MCPClient } from '@flomatai/mcp-client';
 *
 * const fs = new MCPClient({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 *
 * await fs.connect();
 * const tools = await fs.listTools();
 * const result = await fs.callTool('read_file', { path: '/tmp/hello.txt' });
 * await fs.disconnect();
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPClientLike } from '@flomatai/core';
import type { MCPTool, MCPCallResult, StdioServerConfig } from './types.js';

// ── MCPClient ─────────────────────────────────────────────────────────────────

export class MCPClient implements MCPClientLike {
  private readonly serverConfig: StdioServerConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(config: StdioServerConfig) {
    this.serverConfig = config;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Connect to the MCP server.
   * Must be called before listTools() or callTool().
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.transport = new StdioClientTransport({
      command: this.serverConfig.command,
      args: this.serverConfig.args,
      env: this.serverConfig.env,
      cwd: this.serverConfig.cwd,
    });

    this.client = new Client(
      { name: 'flomatai-mcp-client', version: '0.1.0' },
      { capabilities: {} },
    );

    await this.client.connect(this.transport);
    this.connected = true;
  }

  /**
   * Disconnect from the MCP server and clean up the subprocess.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client?.close();
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  // ── Tool discovery ──────────────────────────────────────────────────────────

  /**
   * List all tools exposed by the connected MCP server.
   * Implements MCPClientLike.listTools().
   */
  async listTools(): Promise<MCPTool[]> {
    this.assertConnected();
    const result = await this.client!.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));
  }

  // ── Tool invocation ─────────────────────────────────────────────────────────

  /**
   * Call a named tool and return the raw result.
   *
   * For most tools the result will be a single text block which this method
   * automatically unwraps:
   *   - Single text block  → returns the string value
   *   - Multiple blocks / non-text → returns the full MCPCallResult object
   *   - isError === true   → throws an Error
   *
   * Implements MCPClientLike.callTool().
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.assertConnected();

    const raw = await this.client!.callTool({ name, arguments: args });

    const result: MCPCallResult = {
      isError: raw.isError === true,
      content: (raw.content ?? []) as MCPCallResult['content'],
    };

    if (result.isError) {
      const errText = result.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      throw new Error(`MCP tool "${name}" returned an error: ${errText || '(no message)'}`);
    }

    // Unwrap single text block for ergonomics
    if (result.content.length === 1 && result.content[0]?.type === 'text') {
      return result.content[0].text;
    }

    return result;
  }

  /**
   * Call a tool and return the full MCPCallResult (never unwrapped, never throws on isError).
   * Use this when you need full control over error handling or multi-block responses.
   */
  async callToolRaw(name: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    this.assertConnected();

    const raw = await this.client!.callTool({ name, arguments: args });
    return {
      isError: raw.isError === true,
      content: (raw.content ?? []) as MCPCallResult['content'],
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.connected;
  }

  private assertConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error(
        'MCPClient is not connected. Call connect() before using listTools() or callTool().',
      );
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create and immediately connect an MCPClient.
 *
 * @example
 * ```ts
 * const fs = await connectMCPClient({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 * ```
 */
export async function connectMCPClient(config: StdioServerConfig): Promise<MCPClient> {
  const client = new MCPClient(config);
  await client.connect();
  return client;
}
