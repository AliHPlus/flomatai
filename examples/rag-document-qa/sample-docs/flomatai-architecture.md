# flomatai Architecture Guide

## Overview

flomatai is a code-first AI automation framework. Instead of wiring nodes in a GUI,
you define pipelines in TypeScript using a fluent DSL. This gives you full IDE
support, type safety, version control, and the ability to compose pipelines programmatically.

## Core Concepts

### Skills

A Skill is the atomic unit of work in flomatai. Every Skill:
- Has a name, description, inputSchema (Zod), and outputSchema (Zod)
- Implements an `execute(input, context)` method
- Can be an LLMSkill, TransformSkill, IOSkill, or PythonSkill

Skills are stateless — all state flows through the pipeline context.
This makes skills easy to test in isolation.

### Pipelines

A Pipeline is an ordered sequence of Steps. You define pipelines using the
Pipeline.create() builder:

```typescript
const pipeline = Pipeline.create('my-pipeline')
  .step('fetch', fetchSkill)
  .step('transform', transformSkill)
  .mapOver('items', subPipeline, { concurrency: 3 })
  .build();
```

Pipelines are immutable value objects after `.build()` is called.
The Pipeline builder supports: step, mapOver, filter, reduce, parallel, branch.

### Orchestrator

The Orchestrator runs pipelines. It manages:
- LLM provider routing (which model to use for which step)
- State persistence (memory, file, SQLite)
- Checkpointing and resume
- Lifecycle hooks (beforePipeline, afterStep, onError, etc.)
- Token accounting

```typescript
const orchestrator = new Orchestrator({
  llm: { default: anthropic({ model: 'claude-3-5-sonnet-20241022' }) },
  state: new MemoryStore(),
});

const { output, run } = await orchestrator.run(pipeline, input);
```

### Agents

An Agent wraps a Pipeline (or set of Skills) with a Strategy:
- SequentialStrategy: run skills in order
- RouterStrategy: one LLM call selects which skill to run
- PlanAndExecuteStrategy: LLM creates a plan, then executes steps
- ReActStrategy: thought → action → observation loop (like AutoGPT)
- CustomStrategy: user-provided function

Agents support recursive sub-agent spawning with configurable max depth.

## LLM Providers

flomatai supports multiple LLM providers:
- `@flomatai/provider-anthropic` — Claude models via Anthropic API
- `@flomatai/provider-openai` — GPT models via OpenAI API
- `@flomatai/provider-ollama` — local models via Ollama
- `@flomatai/provider-openai-compat` — any OpenAI-compatible API (OpenRouter, Groq, OpenCode)

All providers implement the same `LLMProvider` interface, so you can switch without
changing your pipeline code.

## State Stores

Three built-in state stores:
- `MemoryStore` — in-memory, no persistence (testing/dev)
- `FileStore` — JSON file on disk (simple persistence)
- `SQLiteStore` — SQLite database (production, checkpointing, run history)

## Python Bridge

The `@flomatai/bridge-python` package lets you call Python scripts as Skills.
The bridge uses a subprocess with a JSON protocol. Use it for data science,
pandas analysis, or any Python library not available in Node.js.

## Checkpointing

Enable checkpointing on a pipeline with `.withCheckpointing()`.
The Orchestrator saves each completed step's output. If the pipeline fails,
rerun with the same `runId` to resume from the last checkpoint.

## Concurrency

The `mapOver` step runs a sub-pipeline for each item in an array.
Set `concurrency: N` to process N items simultaneously.
Combine with `onItemError: 'skip'` to continue if individual items fail.

## Error Handling

flomatai has a rich error hierarchy:
- SkillError — base error for skill execution failures
- SkillValidationError — Zod schema validation failure
- SkillTimeoutError — skill exceeded its timeout
- PipelineError — pipeline-level failure
- LLMError — LLM call failure
- LLMRateLimitError — rate limit hit (retried automatically)

All errors include context (step name, run ID) for easy debugging.
