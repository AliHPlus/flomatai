# ETL + Python Analysis

Extracts data from 3 sources in parallel (CSV, JSON, mock API), merges them, runs Python statistical analysis, then generates an LLM executive narrative report.

## Pipeline Graph

```
parallel (3 extracts simultaneously):
  ├── extract-sales    (CSV → structured rows)
  ├── extract-users    (JSON → user records)
  └── extract-metrics  (JSON → system metrics)
    ↓
merge-data
    ↓
analyze-python (Python bridge — statistical aggregations, pure stdlib, no pandas required)
    ↓
generate-narrative (LLM → executive report)
```

## Features

- 3 parallel extracts with no shared state
- Python analysis via the `@flomatai/bridge-python` subprocess bridge
- Pure Python stdlib (no pandas dependency — works in any environment)
- Synthetic sample data bundled in `data/` — works out of the box
- LLM generates executive summary, highlights, recommendations, and risk flags

## Setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Run with bundled synthetic data (Q1 2024 sales/users/metrics)
node dist/src/run.js

# Save report to file
node dist/src/run.js --output ./report.md

# Use your own data files
node dist/src/run.js \
  --sales ./my-data/sales.csv \
  --users ./my-data/users.json \
  --metrics ./my-data/metrics.json \
  --period "Q2 2024"
```

## Data Formats

**sales.csv** columns: `date, product, region, quantity, unit_price, revenue, salesperson_id`

**users.json**: Array of `{ id, name, plan, signup_date, region, active, sessions_last_30d, spend_lifetime }`

**metrics.json**: `{ period, api_calls: {...}, performance: {...}, growth: {...} }`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key (alternative) |
| `OPENCODE_BASE_URL` | Use local OpenCode proxy |
| `PYTHON_PATH` | Python executable (default: `python3`) |
| `SALES_CSV` | Path to sales CSV (default: bundled) |
| `USERS_JSON` | Path to users JSON (default: bundled) |
| `METRICS_JSON` | Path to metrics JSON (default: bundled) |
