# Autonomous Research Agent

An autonomous research agent that uses the **ReAct** (Reasoning + Acting) strategy to iteratively search the web, scrape pages, extract facts, and synthesize a comprehensive report — with no search API key required.

## Pipeline Graph

```
ReAct Loop (up to N iterations):
  THINK → what to search/scrape/extract next
  ACT   → one of: search-web | scrape-page | extract-facts | synthesize-report
  OBSERVE → feed result back to agent for next decision
  ↓
[when agent decides it has enough info]
synthesize-report → structured report with findings + sources + gaps
```

## Features

- **No API key for search** — uses DuckDuckGo HTML endpoint
- **Autonomous** — agent decides what to search and when to stop
- **ReAct strategy** with periodic reflection to avoid loops
- **Structured output** — title, summary, findings, sources, confidence, gaps
- **Trace logging** — see every thought and action the agent took

## Setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Research a topic
node dist/src/run.js --topic "The impact of LLMs on software development"

# More iterations for deeper research
node dist/src/run.js --topic "Quantum computing 2024 state" --max-iter 12

# Save report
node dist/src/run.js --topic "Climate tech startups 2024" --output ./report.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key (alternative) |
| `OPENCODE_BASE_URL` | — | Use local OpenCode proxy |
| `MAX_ITERATIONS` | `8` | ReAct loop max iterations |
| `MAX_SOURCES` | `5` | Max pages to scrape |

## How ReAct Works

The agent follows a loop:

1. **THINK**: The LLM reasons about what to do next given all previous observations
2. **ACT**: Execute one skill (search, scrape, extract, or synthesize)
3. **OBSERVE**: Feed the result back; the LLM sees what the skill returned
4. **Repeat** until the agent calls `synthesize-report` or hits `MAX_ITERATIONS`

Every 4 steps, the agent reflects on its progress to avoid getting stuck in loops.
