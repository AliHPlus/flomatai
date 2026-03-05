/**
 * MCP Demo — runner script.
 *
 * Connects to the MCP filesystem server, discovers its tools, builds a ReAct
 * agent, and answers a user question about the filesystem.
 *
 * Usage:
 *   node dist/src/run.js --dir /tmp --task "List all .ts files and summarize them"
 *   node dist/src/run.js --dir /root/flomatai/packages/core/src --task "What does this package export?"
 *   node dist/src/run.js --dir /root/flomatai --task "Find all package.json files"
 */

import { Orchestrator, MemoryStore, logger, getArg } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';
import { connectMCPClient, createMCPSkillsFromServer } from '@flomatai/mcp-client';
import { createFilesystemAgent } from './agent.js';

async function main() {
  const dir = getArg('--dir') ?? process.env['MCP_DIR'] ?? '/tmp';
  const task = getArg('--task') ?? process.env['TASK'];

  if (!task) {
    console.error('Error: --task <task> is required');
    console.error('Example: node dist/src/run.js --dir /tmp --task "List all files"');
    process.exit(1);
  }

  const maxIterStr = getArg('--max-iter') ?? '10';
  const maxIterations = parseInt(maxIterStr, 10);

  console.log(`\n▶ MCP Filesystem Agent`);
  console.log(`  Directory:  ${dir}`);
  console.log(`  Task:       ${task}`);
  console.log(`  Max iters:  ${maxIterations}\n`);

  // 1. Connect to the MCP filesystem server
  console.log('Connecting to MCP filesystem server...');
  const fsClient = await connectMCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', dir],
  });

  try {
    // 2. Auto-discover all tools as Skills
    const skills = await createMCPSkillsFromServer(fsClient);
    console.log(`Connected. Discovered ${skills.length} tools: ${skills.map((s) => s.meta.name).join(', ')}\n`);

    // 3. Build the agent
    const agent = createFilesystemAgent(skills, maxIterations);

    // 4. Build orchestrator with MCP registry
    const orchestrator = new Orchestrator({
      llm: { default: resolveLLMFromEnv({ temperature: 0.1, maxTokens: 4096 }) },
      mcp: { filesystem: fsClient },
      state: new MemoryStore(),
      hooks: {
        onError: (_step, err) => { console.error(`  ✗ Error: ${err.message}`); },
      },
    });

    // 5. Run the agent
    const agentLogger = logger.child('filesystem-agent');
    const ctx = agent.createContext({
      llmRegistry: orchestrator.llm,
      state: orchestrator.stateStore,
      logger: agentLogger,
      runId: `mcp-demo-${Date.now()}`,
      emit: () => {},
    });

    const startMs = Date.now();
    const result = await agent.run({ task, directory: dir }, ctx);
    const elapsed = Date.now() - startMs;

    console.log(`\n✓ Agent completed in ${elapsed}ms (${result.tokensUsed} tokens, ${result.trace.length} steps)\n`);

    // 6. Display reasoning trace
    console.log('── Reasoning Trace ────────────────────────────────────────');
    for (const entry of result.trace) {
      if (entry.type === 'thought') {
        console.log(`\n[Step ${(entry.iteration ?? 0) + 1}] THINK: ${String(entry.content).substring(0, 120)}...`);
      } else if (entry.type === 'action') {
        console.log(`        ACT:   ${entry.skill}(${JSON.stringify(entry.input).substring(0, 80)})`);
      } else if (entry.type === 'finish') {
        console.log(`\n[FINISH]`);
      }
    }
    console.log('───────────────────────────────────────────────────────────\n');

    // 7. Display output
    console.log('── Result ─────────────────────────────────────────────────');
    console.log(typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output, null, 2));
    console.log('───────────────────────────────────────────────────────────');

  } finally {
    await fsClient.disconnect();
    console.log('\nMCP server disconnected.');
  }
}

main().catch((err) => {
  console.error('\n✗ Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
