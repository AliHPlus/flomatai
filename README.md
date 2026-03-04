# flomatai

> A code-first AI automation framework built on **Skills** and **Agents** — a flexible alternative to n8n and OpenClaw.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

## Why flomatai?

| | n8n | OpenClaw | **flomatai** |
|---|---|---|---|
| Definition | JSON GUI | YAML | **TypeScript DSL** |
| Version control | Hard (JSON blobs) | OK | **Native (code)** |
| IDE support | None | Basic | **Full autocomplete + types** |
| Agent hierarchy | None | Flat | **Recursive sub-agents** |
| LLM providers | Per-node config | Fixed | **Pluggable adapters** |
| Iteration | SplitInBatches node | Manual | **Built-in map/reduce/filter** |
| Python skills | No | No | **Yes (subprocess bridge)** |
| State/persistence | In-memory | File | **Pluggable (Memory/File/SQLite/Redis/PG)** |
| Resume on failure | No | No | **Yes (checkpoints)** |
| Token tracking | No | No | **Yes (per step + total)** |

---

## Core Concepts

### Skill
The atomic unit of work. A typed, composable function with optional LLM backing:

```typescript
import { LLMSkill, TransformSkill, IOSkill } from '@flomatai/core';

// LLM-backed skill (replaces n8n chainLlm node)
const summarizeSkill = LLMSkill.create({
  name: 'summarize',
  description: 'Summarizes text into bullet points',
  prompt: (input) => `Summarize in 3 bullets:\n${input.text}`,
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
  parseOutput: (raw) => ({ summary: raw }),
  llmOptions: { temperature: 0.2, maxTokens: 1024 },
  retries: 2,
  cache: { ttl: 3600, key: (input) => input.text.substring(0, 50) },
});

// Pure data transform (replaces n8n Code node)
const parseSkill = TransformSkill.create({
  name: 'parse-json',
  description: 'Parses raw JSON string',
  inputSchema: z.object({ raw: z.string() }),
  outputSchema: z.object({ data: z.unknown() }),
  transform: (input) => ({ data: JSON.parse(input.raw) }),
});

// File/HTTP IO
const fetchSkill = IOSkill.httpGet({
  name: 'fetch-api',
  url: (input) => `https://api.example.com/data/${input.id}`,
  headers: (input) => ({ Authorization: `Bearer ${input.token}` }),
});
```

**Skill types:**
| Type | Factory | Use case |
|---|---|---|
| `LLMSkill` | `LLMSkill.create()` | LLM prompt + parse |
| `TransformSkill` | `TransformSkill.create()` | Pure data transformation |
| `IOSkill` | `IOSkill.httpGet/httpPost/readFile/writeFile()` | File and HTTP operations |
| `PythonSkill` | `PythonSkill.create()` | Python function via subprocess bridge |

---

### Agent
An intelligent orchestrator that composes skills using a configurable strategy:

```typescript
import { createAgent } from '@flomatai/core';

const planningAgent = createAgent({
  name: 'planning-agent',
  role: 'You are a senior software architect who creates detailed service plans.',
  skills: [researchSkill, definitionSkill, useCasesSkill, featuresSkill],
  strategy: 'plan-and-execute',  // LLM decides which skills to run
  llm: 'default',
  maxIterations: 20,
});
```

**Agent strategies:**

| Strategy | LLM calls | Best for |
|---|---|---|
| `sequential` | 0 | Known pipelines, deterministic flows |
| `router` | 1 | Triage — route input to the right skill |
| `plan-and-execute` | 1–4 | Multi-step with dynamic skill selection |
| `react` | N (iterative) | Open-ended research and exploration |
| `custom` | User-defined | Maximum control |

**Hierarchical agents** — agents can spawn sub-agents (up to configurable depth):

```typescript
// Inside a custom strategy or react loop:
const subAgent = ctx.spawnAgent({
  name: 'db-specialist',
  role: 'You are a database schema expert.',
  skills: [dbSchemaSkill, migrationSkill],
  strategy: 'sequential',
});
const result = await subAgent.run(input, ctx);
```

---

### Pipeline
A directed graph of steps built with a fluent TypeScript DSL:

```typescript
import { Pipeline } from '@flomatai/core';

const pipeline = Pipeline.create('my-pipeline')
  .withCheckpointing()              // enable resume on failure
  .input(z.object({ text: z.string() }))

  // Single skill step
  .step('summarize', summarizeSkill)

  // Step with custom input mapping
  .step('enrich', enrichSkill, {
    input: (ctx) => ({
      summary: ctx.stepOutputs['summarize'],
      original: ctx.pipelineInput,
    }),
  })

  // Skip a step conditionally
  .step('translate', translateSkill, {
    skipIf: (ctx) => ctx.pipelineInput.language === 'en',
  })

  // Map over an array (replaces n8n SplitInBatches)
  .mapOver('enrich.items', perItemPipeline, {
    concurrency: 3,        // process 3 items in parallel
    onItemError: 'skip',   // skip failed items, continue others
  })

  // Filter array items
  .filter('items', (item) => item.score > 0.8)

  // Reduce to single value
  .reduce('items', (acc, item) => [...acc, item.name], [])

  // Run multiple pipelines in parallel
  .parallel([analysisPipeline, formattingPipeline])

  // Conditional branching
  .branch('route', (ctx) => ctx.previousOutput.type, {
    'simple': simplePipeline,
    'complex': complexPipeline,
  })

  .output(z.array(z.string()))
  .build();
```

---

### Orchestrator
The runtime engine that executes pipelines:

```typescript
import { Orchestrator } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { sqliteStore } from '@flomatai/state-sqlite';

const engine = new Orchestrator({
  // LLM registry — 'default' is used when no specific LLM is requested
  llm: {
    default: anthropic({ model: 'claude-3-5-sonnet-20241022', temperature: 0.2 }),
    research: anthropic({ model: 'claude-3-5-sonnet-20241022', temperature: 0.1 }),
    fast: openai({ model: 'gpt-4o-mini' }),
    local: ollama({ model: 'llama3' }),
  },

  // Pluggable persistence
  state: sqliteStore('.flomatai/state.db'),

  // Lifecycle hooks
  hooks: {
    beforeStep: (step) => console.log(`→ ${step.name}`),
    afterStep: (step, record) => console.log(`✓ ${step.name} (${record.durationMs}ms)`),
    onError: (step, error) => console.error(`✗ ${step?.name}: ${error.message}`),
  },
});

// Execute
const { output, run } = await engine.run(pipeline, { text: 'Hello world' });
console.log(output);
console.log(`Run ID: ${run.id} | Tokens: ${run.tokensUsed}`);
```

---

## Quick Start

```bash
pnpm add @flomatai/core @flomatai/provider-anthropic
```

```typescript
import { Pipeline, LLMSkill, Orchestrator } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { z } from 'zod';

const summarize = LLMSkill.create({
  name: 'summarize',
  description: 'Summarizes text',
  prompt: (input) => `Summarize in 3 bullets:\n${input.text}`,
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ bullets: z.array(z.string()) }),
  parseOutput: (raw) => ({ bullets: raw.split('\n').filter(Boolean) }),
});

const pipeline = Pipeline.create('summarizer')
  .input(z.object({ text: z.string() }))
  .step('summarize', summarize)
  .output(z.object({ bullets: z.array(z.string()) }))
  .build();

const engine = new Orchestrator({
  llm: { default: anthropic({ model: 'claude-3-5-sonnet-20241022' }) },
});

const { output } = await engine.run(pipeline, {
  text: 'Your long article here...',
});
console.log(output.bullets);
```

---

## LLM Providers

| Package | Factory | Supports |
|---|---|---|
| `@flomatai/provider-anthropic` | `anthropic({})` | Claude 3.5, 3, 2, Haiku, Sonnet, Opus |
| `@flomatai/provider-openai` | `openai({})` | GPT-4o, o1, o3, GPT-3.5, any OpenAI model |
| `@flomatai/provider-ollama` | `ollama({ model })` | Llama3, Mistral, DeepSeek, any Ollama model |
| `@flomatai/provider-openai-compat` | `openaiCompat({})` | Any OpenAI-compatible API |
| `@flomatai/provider-openai-compat` | `openRouter({})` | OpenRouter (200+ models) |
| `@flomatai/provider-openai-compat` | `groq({})` | Groq (ultra-fast inference) |
| `@flomatai/provider-openai-compat` | `openCode({})` | OpenCode local proxy |

```typescript
import { openaiCompat } from '@flomatai/provider-openai-compat';

// Any OpenAI-compatible endpoint:
const codex = openaiCompat({
  baseUrl: 'https://api.codex.example.com/v1',
  apiKey: process.env.CODEX_KEY,
  model: 'codex-pro',
  providerName: 'codex',
});
```

---

## State / Persistence

```typescript
import { MemoryStore, FileStore } from '@flomatai/core';
import { sqliteStore } from '@flomatai/state-sqlite';

// Development / testing
state: new MemoryStore()

// Small-scale / file-based
state: new FileStore('.flomatai/store.json')

// Production-grade (recommended)
state: sqliteStore('.flomatai/state.db')
```

All stores support:
- **Key/value cache** with TTL
- **Run history** (list, filter by pipeline/status)
- **Step checkpoints** for resume capability

---

## Python Skills

Run Python functions as flomatai skills:

```typescript
import { PythonSkill } from '@flomatai/bridge-python';
import { z } from 'zod';

const analyticsSkill = PythonSkill.create({
  name: 'run-analytics',
  description: 'Runs pandas analytics on a dataset',
  script: './skills/analytics.py',
  function: 'analyze',
  inputSchema: z.object({ data: z.array(z.record(z.unknown())) }),
  outputSchema: z.object({ mean: z.number(), std: z.number(), summary: z.string() }),
  timeout: 60_000,
});
```

```python
# skills/analytics.py
from flomatai_bridge import skill, run
import statistics

@skill
def analyze(input: dict) -> dict:
    values = [row['value'] for row in input['data']]
    return {
        'mean': statistics.mean(values),
        'std': statistics.stdev(values),
        'summary': f'Analyzed {len(values)} records',
    }

if __name__ == '__main__':
    run()
```

---

## CLI

```bash
pnpm add -g @flomatai/cli

# Run a pipeline from a module file
flomatai run ./pipelines/my-pipeline.js --input '{"text":"Hello"}'
flomatai run ./pipelines/my-pipeline.js --input-file docs.md

# Inspect a run
flomatai inspect <run-id> --steps --output

# List recent runs
flomatai list --pipeline my-pipeline --status completed --limit 10

# Resume a failed run from last checkpoint
flomatai resume <run-id> ./pipelines/my-pipeline.js
```

---

## Packages

| Package | Description |
|---|---|
| `@flomatai/core` | Core: Skills, Agents, Pipeline DSL, Orchestrator, Memory/File state |
| `@flomatai/provider-anthropic` | Anthropic Claude provider |
| `@flomatai/provider-openai` | OpenAI GPT provider |
| `@flomatai/provider-ollama` | Ollama local model provider |
| `@flomatai/provider-openai-compat` | Generic OpenAI-compatible provider (OpenCode, OpenRouter, Groq, etc.) |
| `@flomatai/state-sqlite` | SQLite persistence with run history and checkpoints |
| `@flomatai/bridge-python` | Python skill subprocess bridge |
| `@flomatai/cli` | CLI: `flomatai run`, `flomatai list`, `flomatai inspect`, `flomatai resume` |

---

## Examples

### Verlivo Planning Pipeline
[`examples/verlivo-planning`](./examples/verlivo-planning) — a complete port of the 22-node n8n Verlivo workflow to flomatai.

**What it does:** Takes software documentation → extracts all microservices → for each service runs 7 LLM planning steps → outputs complete service plan documents.

**n8n → flomatai mapping:**
| n8n Component | flomatai Equivalent |
|---|---|
| `chatTrigger` node | `pipeline.input()` |
| `chainLlm` node | `LLMSkill.create()` |
| `Code` node | `TransformSkill.create()` |
| `SplitInBatches` node | `.mapOver(field, subPipeline, { concurrency })` |
| OpenCode LLM node | `openCode({})` provider |
| Save 1..N Code nodes | Eliminated — outputs flow through pipeline context |
| Workflow settings | `Orchestrator` config |

```bash
cd examples/verlivo-planning
pnpm install
pnpm build
ANTHROPIC_API_KEY=sk-... node dist/src/run.js --file docs.md
```

---

## Architecture

```
Input
  └─► Pipeline
        ├─► step('name', skill)           ← Skill: LLM, Transform, IO, Python
        ├─► step('name', agent)           ← Agent: sequential|router|plan-execute|react|custom
        │     ├─► Skill                       └─► Sub-Agent (recursive, max depth configurable)
        │     └─► Sub-Agent
        ├─► .mapOver(field, subPipeline)  ← iterate array with configurable concurrency
        ├─► .filter(field, predicate)     ← filter array
        ├─► .reduce(field, reducer, init) ← reduce array to value
        ├─► .parallel([p1, p2, p3])       ← run pipelines concurrently
        └─► .branch('name', condition, {  ← conditional routing
              'a': pipelineA,
              'b': pipelineB,
            })

LLM Registry → { default, research, fast, local, ... }
State Store  → Memory | File | SQLite | Redis | PostgreSQL
Hooks        → beforePipeline | afterPipeline | beforeStep | afterStep | onError
```

---

## License

MIT
