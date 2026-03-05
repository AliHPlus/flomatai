# Multi-Format Content Generation

Generates 4 content formats simultaneously from a single topic using flomatai's `parallel` step. Research a topic once, produce a blog post, Twitter thread, LinkedIn post, and TL;DR newsletter snippet in parallel, with optional translation.

## Pipeline Graph

```
research-topic
    ↓
parallel (all 4 formats at once):
  ├── format-blog      → blog post (600+ words, markdown)
  ├── format-twitter   → thread (5-8 tweets, ≤280 chars each)
  ├── format-linkedin  → post (1300-1800 chars, professional)
  └── format-tldr      → snippet (headline + 3 bullets + takeaway)
    ↓
[optional] translate-content (--translate-to <language>)
```

## Setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Generate all 4 formats for a topic
node dist/src/run.js --topic "The future of AI automation"

# With audience and tone guidance
node dist/src/run.js \
  --topic "TypeScript generics explained" \
  --audience "junior developers" \
  --tone "educational and friendly"

# With translation
node dist/src/run.js \
  --topic "Remote work best practices" \
  --translate-to "Spanish"

# Custom output directory
node dist/src/run.js --topic "..." --output ./my-content
```

## Output Files

All files are saved to `./output/` (or `--output` path):

| File | Description |
|------|-------------|
| `<slug>-blog.md` | Long-form blog post in Markdown |
| `<slug>-twitter.md` | Twitter thread (numbered tweets) |
| `<slug>-linkedin.md` | LinkedIn post ready to publish |
| `<slug>-tldr.md` | Newsletter snippet |
| `<slug>-blog-<lang>.md` | Translated blog (if `--translate-to` set) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key (alternative) |
| `OPENCODE_BASE_URL` | Use local OpenCode proxy |
| `OUTPUT_DIR` | Output directory (default: `./output`) |
