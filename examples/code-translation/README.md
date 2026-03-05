# Code Translation

Translates an entire codebase from one programming language to another. Discovers source files, creates a translation plan, translates files with concurrency=3, and saves output. Uses **SQLite checkpointing** so interrupted runs resume from where they left off.

## Pipeline Graph

```
discover-files → plan-translation
    ↓
mapOver:files (concurrency=3, SQLite checkpointed)
    → translate-single-file
    ↓
save-translated → MIGRATION_REPORT.md
```

## Features

- **SQLite checkpointing** — resume interrupted runs with `--resume <run-id>`
- **Concurrency=3** — translates 3 files simultaneously
- **Translation plan** — LLM analyzes the whole project first, assigns dependencies/order
- **Bundled sample project** — 3 Python files (auth, cache, API client) ready to translate
- **Migration report** — generated Markdown with warnings needing manual review

## Setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Translate bundled sample Python project to TypeScript
node dist/src/run.js

# Translate your own project
node dist/src/run.js \
  --source ./my-python-app \
  --from Python \
  --to TypeScript \
  --output ./my-typescript-app

# Resume an interrupted translation
node dist/src/run.js --resume run_abc123

# Translate to other languages
node dist/src/run.js --from Python --to Go
node dist/src/run.js --from JavaScript --to TypeScript
```

## Checkpoint / Resume

The pipeline uses SQLite to save each completed step. If translation is interrupted (e.g., API timeout, rate limit), resume without re-translating already-done files:

```bash
# The run ID is printed at start and end
node dist/src/run.js --resume run_abc123xyz
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key (alternative) |
| `OPENCODE_BASE_URL` | — | Use local OpenCode proxy |
| `DB_PATH` | `.flomatai/code-translation.db` | SQLite checkpoint DB |
| `RESUME` | — | Run ID to resume |

## Sample Project

Three Python modules in `sample-project/src/`:

| File | Description |
|------|-------------|
| `auth.py` | JWT-like auth with PBKDF2 hashing (250 LOC) |
| `cache.py` | Thread-safe LRU cache with TTL (120 LOC) |
| `api_client.py` | HTTP client with retry + rate limiting (140 LOC) |
