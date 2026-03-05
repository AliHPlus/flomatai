# RAG Document Q&A

A Retrieval-Augmented Generation (RAG) pipeline that answers questions about your documents. Uses an in-memory TF-IDF vector store — no external database or embedding API required.

## Pipeline Graph

```
ingest-docs → retrieve (TF-IDF cosine similarity) → generate-answer (LLM + citations)
```

## Features

- Pure TypeScript TF-IDF with cosine similarity — zero external dependencies
- Chunk-based retrieval with configurable chunk size and overlap
- Answers grounded in retrieved context with source citations
- Confidence scoring (high/medium/low)
- Works with Markdown and plain text files

## Setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY)
pnpm install
pnpm build
```

## Usage

```bash
# Ask about the bundled sample docs (TypeScript + flomatai architecture)
node dist/src/run.js --query "What is type inference in TypeScript?"
node dist/src/run.js --query "How does the flomatai Orchestrator work?"

# Ask about your own documents
node dist/src/run.js --docs ./my-docs --query "How does authentication work?"

# Single file
node dist/src/run.js --file ./README.md --query "What does this project do?"

# Tune retrieval
node dist/src/run.js --query "..." --top-k 8 --chunk-size 800
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key (alternative) |
| `OPENCODE_BASE_URL` | — | Use local OpenCode proxy |
| `CHUNK_SIZE` | `500` | Characters per chunk |
| `CHUNK_OVERLAP` | `50` | Overlap between chunks |
| `TOP_K` | `5` | Number of chunks to retrieve |

## Sample Documents

Two sample documents are bundled in `sample-docs/`:
- `typescript-handbook.md` — TypeScript concepts (inference, generics, decorators, etc.)
- `flomatai-architecture.md` — flomatai architecture guide
