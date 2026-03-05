/**
 * MCP Demo — test runner using MockMCPClient + MockLLMProvider.
 *
 * No subprocess is spawned. Everything runs in-memory.
 * Verifies:
 *   1. MockMCPClient implements MCPClientLike correctly
 *   2. createMCPSkillsFromServer wraps mock tools as Skills
 *   3. The ReAct agent calls mock tools and finishes
 *   4. OrchestratorConfig.mcp registry is accessible via getMCPClient
 */

import { createTestLLM, createTestOrchestrator, MemoryStore, logger, MockResponse, Orchestrator } from '@flomatai/core';
import { MockMCPClient, createMCPSkillsFromServer } from '@flomatai/mcp-client';
import { createFilesystemAgent } from './agent.js';

async function runTest() {
  console.log('=== MCP Demo — Test ===\n');

  // ── 1. Set up MockMCPClient with fake filesystem tools ───────────────────
  const mockMCP = new MockMCPClient([
    {
      name: 'list_directory',
      description: 'List the contents of a directory',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      response: (args: Record<string, unknown>) => JSON.stringify({
        entries: [
          { name: 'README.md', type: 'file', size: 1024 },
          { name: 'src', type: 'directory' },
          { name: 'package.json', type: 'file', size: 512 },
        ],
        path: args['path'],
      }),
    },
    {
      name: 'read_file',
      description: 'Read the complete contents of a file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      response: (args: Record<string, unknown>) =>
        `# Mock File Contents\n\nThis is the mock content of ${args['path']}.\n\nIt contains example data for testing purposes.`,
    },
    {
      name: 'get_file_info',
      description: 'Get metadata about a file or directory',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      response: (args: Record<string, unknown>) => JSON.stringify({
        path: args['path'],
        size: 1024,
        type: 'file',
        modified: new Date().toISOString(),
      }),
    },
  ]);

  // ── 2. Verify MockMCPClient.listTools() ──────────────────────────────────
  const tools = await mockMCP.listTools();
  console.log(`✓ MockMCPClient.listTools() returned ${tools.length} tools`);
  if (tools.length !== 3) throw new Error(`Expected 3 tools, got ${tools.length}`);

  // ── 3. Auto-discover skills ──────────────────────────────────────────────
  const skills = await createMCPSkillsFromServer(mockMCP);
  console.log(`✓ createMCPSkillsFromServer() created ${skills.length} skills: ${skills.map((s) => s.meta.name).join(', ')}`);
  if (skills.length !== 3) throw new Error(`Expected 3 skills, got ${skills.length}`);

  // ── 4. Verify createMCPSkillsFromServer with filters ─────────────────────
  const filtered = await createMCPSkillsFromServer(mockMCP, { only: ['read_file'] });
  console.log(`✓ createMCPSkillsFromServer(only: ['read_file']) returned ${filtered.length} skill`);
  if (filtered.length !== 1) throw new Error(`Expected 1 skill, got ${filtered.length}`);

  // ── 5. Verify callTool ───────────────────────────────────────────────────
  const dirResult = await mockMCP.callTool('list_directory', { path: '/tmp' });
  console.log(`✓ MockMCPClient.callTool() returned: ${String(dirResult).substring(0, 60)}...`);
  if (!dirResult) throw new Error('callTool returned nothing');
  if (mockMCP.callCount !== 1) throw new Error(`Expected 1 call, got ${mockMCP.callCount}`);

  // ── 6. Run the agent with mock LLM + mock MCP ────────────────────────────
  const overrides: MockResponse[] = [
    // First thought: list directory
    {
      match: /what do you do next/i,
      response: JSON.stringify({
        thought: 'I should start by listing the directory to understand its structure.',
        action: {
          type: 'use_skill',
          skill: 'list_directory',
          input: { path: '/tmp' },
        },
      }),
      times: 1,
    },
    // Second thought: read a file
    {
      match: /what do you do next/i,
      response: JSON.stringify({
        thought: 'I found some files. Let me read README.md to understand the project.',
        action: {
          type: 'use_skill',
          skill: 'read_file',
          input: { path: '/tmp/README.md' },
        },
      }),
      times: 1,
    },
    // Third thought: finish
    {
      match: /what do you do next/i,
      response: JSON.stringify({
        thought: 'I have gathered enough information. I can now provide a summary.',
        action: {
          type: 'finish',
          output: {
            summary: 'The /tmp directory contains 3 items: README.md (1KB), src/ directory, and package.json (512B). The README describes mock content for testing.',
            filesFound: ['README.md', 'package.json'],
            directoriesFound: ['src'],
          },
        },
      }),
    },
  ];

  const llm = createTestLLM(overrides);
  const agentLogger = logger.child('test');

  mockMCP.reset(); // Reset call count before agent run

  const agent = createFilesystemAgent(skills, 5);
  const ctx = agent.createContext({
    llmRegistry: { default: llm },
    state: new MemoryStore(),
    logger: agentLogger,
    runId: `test-${Date.now()}`,
    emit: () => {},
  });

  const result = await agent.run({ task: 'List and summarize the /tmp directory', directory: '/tmp' }, ctx);

  console.log(`\n✓ Agent completed`);
  console.log(`  Tokens:     ${result.tokensUsed}`);
  console.log(`  Trace:      ${result.trace.length} steps`);
  console.log(`  MCP calls:  ${mockMCP.callCount}`);
  console.log(`  Output:     ${JSON.stringify(result.output).substring(0, 120)}...`);

  if (!result.output) throw new Error('Agent produced no output');
  if (mockMCP.callCount < 2) throw new Error(`Expected at least 2 MCP calls, got ${mockMCP.callCount}`);

  // ── 7. Verify Orchestrator.mcp registry ──────────────────────────────────
  const orchestrator = new Orchestrator({
    llm: { default: createTestLLM() },
    mcp: { filesystem: mockMCP },
    state: new MemoryStore(),
  });

  if (!orchestrator.mcp['filesystem']) {
    throw new Error('orchestrator.mcp.filesystem not accessible');
  }
  console.log(`\n✓ Orchestrator.mcp registry accessible`);

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
