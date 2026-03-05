# GitHub PR Code Review

Automated PR code reviewer built with flomatai. Fetches a pull request diff from GitHub, reviews each changed file with an LLM (up to 3 concurrently), then posts a consolidated review comment back to the PR.

## Pipeline Graph

```
fetch-pr → mapOver:files (concurrency=3) → review-file → post-review
```

## Features

- Reviews each changed file independently via `mapOver` with `concurrency: 3`
- Skips binary files and files without diffs gracefully
- Posts a single GitHub review with per-file summaries and inline comments
- Approves, requests changes, or adds comments based on severity of findings

## Setup

```bash
cp .env.example .env
# Fill in GITHUB_TOKEN and ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Review PR #42 in org/repo
GITHUB_TOKEN=ghp_xxx node dist/src/run.js --owner org --repo my-repo --pr 42

# Via env vars
export GITHUB_TOKEN=ghp_xxx
export GITHUB_OWNER=org
export GITHUB_REPO=my-repo
export GITHUB_PR=42
node dist/src/run.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (alternative) |
| `OPENCODE_BASE_URL` | No | Use local OpenCode proxy |
| `LLM_MODEL` | No | Override default model |

*One of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is required.
