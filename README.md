# FlomatAI

> Pipelines that think.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue)](./LICENSE)

FlomatAI is a TypeScript framework for building AI-powered automation pipelines. It provides a composable, code-first approach to orchestrating LLM calls, data transforms, HTTP/file I/O, Python scripts, and MCP tools into reliable, type-safe workflows.

---

## Core concepts

### Skill — the atomic unit of work

A Skill is a typed, composable function. Every step in a pipeline is a Skill.

```typescript
import { LLMSkill, TransformSkill, IOSkill } from '@flomatai/core';
import { z } from 'zod';

// LLM-backed skill — prompt in, structured output out
const summarizeSkill = LLMSkill.create({
  name: 'summarize',
  description: 'Summarize text into bullet points',
  prompt: (input) => `Summarize in 3 bullets:\n${input.text}`,
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
  parseOutput: (raw) => ({ summary: raw }),
  llmOptions: { temperature: 0.2, maxTokens: 1024 },
  retries: 2,
  cache: { ttl: 3600, key: (input) => input.text.substring(0, 50) },
});

// Pure data transform — no LLM
const parseSkill = TransformSkill.create({
  name: 'parse-json',
  description: 'Parse raw JSON string',
  inputSchema: z.object({ raw: z.string() }),
  outputSchema: z.object({ data: z.unknown() }),
  transform: (input) => ({ data: JSON.parse(input.raw) }),
});

// HTTP I/O
const fetchSkill = IOSkill.httpGet({
  name: 'fetch-api',
  url: (input) => `https://api.example.com/data/${input.id}`,
  headers: (input) => ({ Authorization: `Bearer ${input.token}` }),
});
```

| Skill type | Factory | Use case |
|---|---|---|
| `LLMSkill` | `LLMSkill.create()` | LLM prompt with structured output |
| `TransformSkill` | `TransformSkill.create()` | Pure data transformation |
| `IOSkill` | `IOSkill.httpGet/httpPost/readFile/writeFile()` | File and HTTP operations |
| `PythonSkill` | `PythonSkill.create()` | Python function via subprocess bridge |
| MCP skill | `createMCPSkill()` | Tool from any MCP server |

---

### Pipeline — compose skills into workflows

```typescript
import { Pipeline } from '@flomatai/core';

const pipeline = Pipeline.create({ name: 'content-pipeline' })
  .pipe('research', researchSkill)
  .pipe('summarize', summarizeSkill, {
    inputFrom: (prev) => ({ text: prev.research.content }),
  })
  .parallel('formats', [blogSkill, twitterSkill, linkedinSkill])
  .mapOver('items', perItemPipeline, { concurrency: 3 })
  .pipe('assemble', assembleSkill);
```

**Pipeline primitives:**

| Primitive | What it does |
|---|---|
| `.pipe(name, skill)` | Sequential step |
| `.parallel(name, skills[])` | Run skills concurrently, collect all results |
| `.mapOver(field, pipeline, opts)` | Fan-out: run sub-pipeline for each item in an array |
| `.branch(condition, yes, no)` | Conditional branching |
| `.filter(name, predicate)` | Filter items in an array field |

---

### Agent — autonomous reasoning loops

An Agent uses a strategy to decide which Skills to call at runtime, based on LLM reasoning.

```typescript
import { createAgent } from '@flomatai/core';

const agent = createAgent({
  name: 'research-agent',
  role: 'You research topics and produce structured reports.',
  skills: [searchSkill, scrapeSkill, synthesizeSkill],
  strategy: 'react',
  reactOptions: {
    maxIterations: 10,
    reflectionInterval: 4,
  },
});
```

**Strategies:**

| Strategy | Description |
|---|---|
| `react` | ReAct: Thought → Action → Observation loop with optional reflection |
| `plan-execute` | Plan all steps upfront, then execute sequentially |
| `direct` | Single LLM call maps input directly to a skill |

Agents support recursive sub-agents, token tracking, and structured reasoning traces.

---

### Orchestrator — wires everything together

```typescript
import { Orchestrator, MemoryStore } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { MCPClient } from '@flomatai/mcp-client';

const orchestrator = new Orchestrator({
  llm: {
    default: anthropic({ model: 'claude-3-5-sonnet-20241022', temperature: 0.2 }),
    fast:    anthropic({ model: 'claude-3-haiku-20240307' }),
  },
  mcp: {
    filesystem: new MCPClient({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    }),
  },
  state: new MemoryStore(),
  hooks: {
    onStepStart: (step) => console.log(`→ ${step.name}`),
    onStepEnd:   (step, result) => console.log(`✓ ${step.name}`),
    onError:     (step, err) => console.error(`✗ ${step.name}:`, err.message),
  },
});

const result = await orchestrator.run(pipeline, input);
```

---

## Packages

| Package | Description |
|---|---|
| [`@flomatai/core`](./packages/core) | Skills, Pipelines, Agents, Orchestrator, state stores |
| [`@flomatai/mcp-client`](./packages/mcp-client) | MCP client — connect to any MCP server, use its tools as Skills |
| [`@flomatai/helpers`](./packages/helpers) | `resolveLLMFromEnv()` and other environment utilities |
| [`@flomatai/provider-anthropic`](./packages/providers/anthropic) | Anthropic Claude provider |
| [`@flomatai/provider-openai`](./packages/providers/openai) | OpenAI provider |
| [`@flomatai/provider-openai-compat`](./packages/providers/openai-compat) | OpenAI-compatible provider (OpenRouter, Groq, local) |
| [`@flomatai/provider-ollama`](./packages/providers/ollama) | Ollama local model provider |
| [`@flomatai/bridge-python`](./packages/bridge-python) | Run Python functions as Skills via subprocess |
| [`@flomatai/state-sqlite`](./packages/state/sqlite) | SQLite state store with run history, caching, and checkpoint/resume |
| [`@flomatai/cli`](./packages/cli) | CLI: run, list, inspect, resume pipelines |

---

## MCP integration

Connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server and use its tools as native FlomatAI Skills.

```typescript
import { connectMCPClient, createMCPSkillsFromServer } from '@flomatai/mcp-client';
import { createAgent } from '@flomatai/core';

// Connect to a local MCP server
const fsClient = await connectMCPClient({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
});

// Auto-discover all tools as Skills
const skills = await createMCPSkillsFromServer(fsClient);

// Use in a ReAct agent
const agent = createAgent({
  name: 'filesystem-agent',
  role: 'You manage files on the local filesystem.',
  skills,
  strategy: 'react',
});

await fsClient.disconnect();
```

Or wrap a single tool:

```typescript
import { createMCPSkill } from '@flomatai/mcp-client';

const readFileSkill = createMCPSkill({
  client: fsClient,
  toolName: 'read_file',
});
```

---

## Python bridge

Run Python functions as Skills with bidirectional JSON communication:

```typescript
import { PythonSkill } from '@flomatai/bridge-python';
import { z } from 'zod';

const analyzeSkill = PythonSkill.create({
  name: 'analyze-data',
  scriptPath: './python/analyze.py',
  functionName: 'run_analysis',
  inputSchema: z.object({ data: z.array(z.record(z.unknown())) }),
  outputSchema: z.object({ mean: z.number(), stddev: z.number() }),
});
```

---

## State & persistence

```typescript
import { MemoryStore, FileStore } from '@flomatai/core';
import { SQLiteStore } from '@flomatai/state-sqlite';

const state = new MemoryStore();                               // ephemeral
const state = new FileStore({ dir: './.flomatai-state' });    // JSON files
const state = new SQLiteStore({ path: './pipeline.db' });     // SQLite with checkpoints
```

Resume a failed run:

```bash
flomatai resume --run-id <id> --db ./pipeline.db
```

---

## Examples

| Example | What it demonstrates |
|---|---|
| [`research-agent`](./examples/research-agent) | Autonomous ReAct agent — web search, fact extraction, structured report synthesis |
| [`content-generation`](./examples/content-generation) | Research → parallel multi-format output (blog, Twitter, LinkedIn, TL;DR) |
| [`rag-document-qa`](./examples/rag-document-qa) | In-memory TF-IDF RAG — ingest docs, retrieve, generate cited answers |
| [`etl-analysis`](./examples/etl-analysis) | Parallel data extraction → Python statistical analysis → LLM narrative |
| [`github-pr-review`](./examples/github-pr-review) | Parallel per-file LLM code review → GitHub PR comment via API |
| [`code-translation`](./examples/code-translation) | Discover → translate → save with SQLite checkpointing and `--resume` |
| [`social-monitoring`](./examples/social-monitoring) | Fetch mentions → classify (concurrency=3) → draft responses → daily digest |
| [`mcp-demo`](./examples/mcp-demo) | ReAct filesystem agent using MCP tools via `@flomatai/mcp-client` |

### Run an example

```bash
# Research agent — no API key needed for search (DuckDuckGo HTML scrape)
cd examples/research-agent
pnpm install && pnpm build
ANTHROPIC_API_KEY=sk-... node dist/src/run.js --topic "WebAssembly in 2025"

# Test mode — no API keys at all
node dist/src/test.js
```

```bash
# MCP filesystem agent
cd examples/mcp-demo
pnpm install && pnpm build
node dist/src/test.js   # MockMCPClient + MockLLMProvider, no keys needed
```

---

## Installation

```bash
pnpm add @flomatai/core

# Providers
pnpm add @flomatai/provider-anthropic
pnpm add @flomatai/provider-openai
pnpm add @flomatai/provider-openai-compat   # OpenRouter, Groq, local

# Optional integrations
pnpm add @flomatai/mcp-client      # MCP server tools
pnpm add @flomatai/bridge-python   # Python skills
pnpm add @flomatai/state-sqlite    # SQLite persistence
pnpm add @flomatai/helpers         # Environment utilities
pnpm add @flomatai/cli             # CLI tooling
```

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENCODE_BASE_URL` | Base URL for OpenAI-compatible endpoint |
| `LLM_MODEL` | Model name override |
| `USE_OPENCODE` | Set to `1` to use the OpenAI-compatible endpoint |

`resolveLLMFromEnv()` from `@flomatai/helpers` reads these automatically and selects the right provider.

---

## Testing without API keys

Every package and example includes a test that runs fully in-memory:

```typescript
import { createTestLLM, createTestOrchestrator } from '@flomatai/core';
import { MockMCPClient } from '@flomatai/mcp-client';

const llm = createTestLLM([
  { match: /summarize/i, response: '{"summary": "Test summary"}' },
]);

const mockMCP = new MockMCPClient([
  {
    name: 'read_file',
    description: 'Read a file',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    response: 'file contents here',
  },
]);

const orchestrator = createTestOrchestrator();
```

---

## License

GPL-3.0-or-later — see [LICENSE](./LICENSE)
