# flomatai

> A code-first AI automation framework built on **Skills** and **Agents** — a flexible alternative to n8n and OpenClaw.

## Why flomatai?

| | n8n | OpenClaw | **flomatai** |
|---|---|---|---|
| Definition | JSON GUI | YAML | **TypeScript DSL** |
| Version control | Hard (JSON blobs) | OK | **Native (code)** |
| Agent hierarchy | None | Flat | **Recursive** |
| LLM providers | Per-node config | Fixed | **Pluggable adapters** |
| Iteration | SplitInBatches node | Manual | **Built-in map/reduce** |
| Python skills | No | No | **Yes (subprocess bridge)** |
| State/persistence | In-memory | File | **Pluggable (file/SQLite/Redis/PG)** |

## Core Concepts

### Skill
Atomic, reusable unit of work. Pure function with typed input/output and optional LLM backing.

### Agent
Intelligent orchestrator that composes skills using a configurable strategy:
- `sequential` — run skills in order
- `router` — LLM picks one skill per input
- `plan-and-execute` — LLM plans all steps upfront then executes
- `react` — iterative Reasoning + Acting loop (ReAct)
- `custom` — bring your own strategy function

Agents can spawn sub-agents (hierarchical, up to configurable depth).

### Pipeline
A directed DAG of steps defined with a fluent TypeScript DSL. Supports `map`, `filter`, `reduce` over collections with configurable concurrency.

### Orchestrator
The runtime engine that executes pipelines, manages state, handles retries, and provides observability hooks.

## Quick Start

```bash
pnpm add @flomatai/core @flomatai/provider-anthropic
```

```typescript
import { Pipeline, LLMSkill, TransformSkill, Orchestrator } from '@flomatai/core';
import { anthropic } from '@flomatai/provider-anthropic';
import { z } from 'zod';

// Define a skill
const summarizeSkill = LLMSkill.create({
  name: 'summarize',
  description: 'Summarizes text',
  prompt: (input) => `Summarize this in 3 bullet points:\n${input.text}`,
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
  parseOutput: (raw) => ({ summary: raw }),
});

// Build a pipeline
const pipeline = Pipeline.create('summarizer')
  .input(z.object({ text: z.string() }))
  .step('summarize', summarizeSkill)
  .output(z.object({ summary: z.string() }))
  .build();

// Run it
const engine = new Orchestrator({
  llm: { default: anthropic({ model: 'claude-3-5-sonnet-20241022' }) },
});

const result = await engine.run(pipeline, { text: 'Your long text here...' });
console.log(result.output);
```

## Packages

| Package | Description |
|---|---|
| `@flomatai/core` | Core framework: Skills, Agents, Pipeline DSL, Orchestrator |
| `@flomatai/provider-anthropic` | Anthropic Claude provider |
| `@flomatai/provider-openai` | OpenAI GPT provider |
| `@flomatai/provider-ollama` | Ollama local model provider |
| `@flomatai/provider-openai-compat` | Generic OpenAI-compatible provider (OpenCode, Codex, etc.) |
| `@flomatai/state-sqlite` | SQLite persistence adapter |
| `@flomatai/bridge-python` | Python skill subprocess bridge |
| `@flomatai/cli` | CLI: `flomatai run`, `flomatai inspect`, `flomatai resume` |

## Examples

- [`examples/verlivo-planning`](./examples/verlivo-planning) — Full microservice planning pipeline (port of the Verlivo n8n workflow)

## Architecture

```
Input
  └─► Pipeline
        ├─► Step (Skill)      ← atomic unit: prompt, transform, HTTP, file, Python
        ├─► Step (Agent)      ← dynamic orchestrator with strategy
        │     ├─► Skill
        │     ├─► Skill
        │     └─► Sub-Agent   ← recursive hierarchy
        └─► mapOver(items)    ← built-in iteration with concurrency control
              └─► Sub-Pipeline (per item)
```

## License

MIT
