/**
 * @flomatai/mcp-client — shared types.
 */

// ── MCP Tool descriptor ───────────────────────────────────────────────────────

/**
 * Descriptor for a single tool exposed by an MCP server.
 * Mirrors the shape returned by the MCP protocol's tools/list response.
 */
export interface MCPTool {
  /** Tool name (used when calling tools/call). */
  name: string;
  /** Human-readable description for agent routing. */
  description: string;
  /** JSON Schema describing the tool's input parameters. */
  inputSchema: Record<string, unknown>;
}

// ── MCP Call Result ───────────────────────────────────────────────────────────

/**
 * The raw result of a tools/call request.
 * The MCP spec allows content to be text, images, or embedded resources.
 */
export interface MCPCallResult {
  /** Whether the tool call produced an error. */
  isError: boolean;
  /**
   * The content blocks returned by the tool.
   * In most cases this will be a single TextContent block.
   */
  content: MCPContentBlock[];
}

export type MCPContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } };

// ── stdio Transport Config ────────────────────────────────────────────────────

/**
 * Configuration for spawning a local MCP server via stdio.
 *
 * @example
 * ```ts
 * const config: StdioServerConfig = {
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * };
 * ```
 */
export interface StdioServerConfig {
  /** The executable to run (e.g. 'npx', 'node', 'python3'). */
  command: string;
  /** Command-line arguments. */
  args?: string[];
  /** Extra environment variables to pass to the subprocess. */
  env?: Record<string, string>;
  /** Working directory for the subprocess. Defaults to process.cwd(). */
  cwd?: string;
}
