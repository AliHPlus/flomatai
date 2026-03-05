/**
 * RAG Document Q&A Pipeline — runner script.
 *
 * Usage:
 *   # Ask a question about the bundled sample docs:
 *   node dist/src/run.js --query "What is type inference in TypeScript?"
 *
 *   # Ask about your own documents:
 *   node dist/src/run.js --docs ./my-docs --query "How does authentication work?"
 *
 *   # Single file:
 *   node dist/src/run.js --file ./docs.md --query "What is the architecture?"
 *
 *   # Tune retrieval:
 *   node dist/src/run.js --query "..." --top-k 8 --chunk-size 800
 */

import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getArg } from '@flomatai/core';
import { ragPipeline } from './pipeline.js';
import { orchestrator } from './orchestrator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is dist/src/ after compilation; go up two levels to reach package root
const SAMPLE_DOCS = join(__dirname, '../../sample-docs');

async function main() {
  const query = getArg('--query') ?? process.env['QUERY'];
  if (!query) {
    console.error('Error: --query <question> is required');
    console.error('Example: node dist/src/run.js --query "What is type inference?"');
    process.exit(1);
  }

  // Resolve document paths
  const docsDir = getArg('--docs');
  const singleFile = getArg('--file');
  let paths: string[];

  if (singleFile) {
    paths = [singleFile];
    console.log(`\nDocument: ${singleFile}`);
  } else if (docsDir) {
    paths = [docsDir];
    console.log(`\nDocuments directory: ${docsDir}`);
  } else {
    paths = [SAMPLE_DOCS];
    console.log(`\nUsing sample docs (pass --docs <dir> or --file <path> for your own)`);
  }

  const topK = getArg('--top-k') ? parseInt(getArg('--top-k')!, 10) : undefined;
  const chunkSize = getArg('--chunk-size') ? parseInt(getArg('--chunk-size')!, 10) : undefined;

  console.log(`Query: "${query}"\n`);

  try {
    const { output } = await orchestrator.run(ragPipeline, {
      paths,
      query,
      topK: topK ?? parseInt(process.env['TOP_K'] ?? '5', 10),
      chunkSize: chunkSize ?? parseInt(process.env['CHUNK_SIZE'] ?? '500', 10),
    });

    const result = output as {
      answer: string;
      citations: Array<{ source: string; excerpt: string }>;
      confidence: string;
    };

    console.log('\n── Answer ─────────────────────────────────────────────');
    console.log(result.answer);

    if (result.citations.length > 0) {
      console.log('\n── Citations ──────────────────────────────────────────');
      result.citations.forEach((c, i) => {
        console.log(`\n[${i + 1}] ${c.source}`);
        console.log(`    "${c.excerpt.substring(0, 120)}..."`);
      });
    }

    console.log(`\n── Confidence: ${result.confidence.toUpperCase()} ──`);
  } catch (err) {
    console.error('\nPipeline failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
