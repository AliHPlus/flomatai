# Social Media Monitoring

Monitors brand mentions from RSS feeds, classifies each mention for sentiment and urgency, drafts responses for high-priority items, and generates a daily digest report. Includes a `--mock` mode that uses synthetic data — no network calls or API keys for sources.

## Pipeline Graph

```
fetch-mentions (RSS or mock data)
    ↓
mapOver:mentions (concurrency=3) → classify-mention (sentiment, urgency, category)
    ↓
filter: urgent items requiring response
    ↓
mapOver:urgent (concurrency=2) → draft-response
    ↓
generate-digest → daily report (markdown)
```

## Features

- **`--mock` mode** — 8 realistic synthetic mentions, no network calls for sources
- **RSS parsing** — fetches and keyword-filters real RSS feeds (no API key)
- **Sentiment classification** — positive/negative/neutral/mixed + urgency (low/medium/high/critical)
- **Auto-response drafting** — drafts responses for urgent/negative mentions
- **Daily digest** — executive summary, themes, recommendations, urgent action items

## Setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Mock mode — works without any RSS feeds or source API keys
node dist/src/run.js --mock --brand "Acme Corp"

# Real RSS feeds
node dist/src/run.js \
  --brand "Acme" \
  --keywords "acme,acmecorp" \
  --rss "https://news.ycombinator.com/rss,https://lobste.rs/rss"

# Save digest to specific file
node dist/src/run.js --mock --brand "Acme" --output ./today-digest.md

# Or use the npm script shortcut:
pnpm mock
```

## Mock Data

The `--mock` flag generates 8 realistic mentions covering:
- Feature praise and criticism
- Bug reports and outage alerts
- Tutorial/community content
- Competitive comparisons
- Funding/business news

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key (alternative) |
| `BRAND_NAME` | `Acme Corp` | Brand to monitor |
| `KEYWORDS` | Brand name | Comma-separated keywords |
| `RSS_FEEDS` | — | Comma-separated RSS URLs |
| `MOCK` | `false` | Use synthetic mock data |
| `OUTPUT_DIR` | `./output` | Digest output directory |
