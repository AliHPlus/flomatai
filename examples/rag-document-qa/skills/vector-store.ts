/**
 * In-memory TF-IDF vector store for RAG.
 *
 * No external dependencies — pure TypeScript.
 *
 * Algorithm:
 *   1. Split documents into chunks of ~N characters with overlap.
 *   2. Compute TF-IDF term vectors for each chunk.
 *   3. At query time, compute TF-IDF for the query and cosine-similarity against all chunks.
 *   4. Return top-K chunks with scores.
 */

export interface Chunk {
  id: string;
  source: string;       // filename or identifier
  text: string;
  startChar: number;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
  'or', 'but', 'with', 'by', 'from', 'as', 'be', 'was', 'are', 'were', 'has',
  'have', 'had', 'this', 'that', 'these', 'those', 'its', 'can', 'will',
  'would', 'could', 'should', 'may', 'might', 'do', 'does', 'did', 'not',
  'no', 'so', 'if', 'then', 'also', 'all', 'any', 'each', 'which', 'when',
  'where', 'who', 'how', 'what', 'than', 'more', 'into', 'about',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  for (const [k, v] of tf) tf.set(k, v / total);
  return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    normA += v * v;
  }
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── VectorStore ───────────────────────────────────────────────────────────────

export class VectorStore {
  private chunks: Chunk[] = [];
  private vectors: Map<string, number>[] = [];
  private idf: Map<string, number> = new Map();

  constructor(
    private readonly chunkSize: number = 500,
    private readonly overlap: number = 50,
  ) {}

  /** Add a document. Call buildIndex() after adding all documents. */
  addDocument(source: string, text: string): void {
    const chunks = this.splitIntoChunks(source, text);
    this.chunks.push(...chunks);
  }

  /** Build TF-IDF index. Must be called after all documents are added. */
  buildIndex(): void {
    // Compute raw TF vectors
    const tfVectors = this.chunks.map((c) => termFrequency(tokenize(c.text)));

    // Compute IDF
    const docFreq = new Map<string, number>();
    for (const tf of tfVectors) {
      for (const term of tf.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }
    const N = this.chunks.length || 1;
    this.idf = new Map(
      [...docFreq.entries()].map(([term, df]) => [term, Math.log(N / df + 1)]),
    );

    // Compute TF-IDF vectors
    this.vectors = tfVectors.map((tf) => {
      const tfidf = new Map<string, number>();
      for (const [term, tfVal] of tf) {
        tfidf.set(term, tfVal * (this.idf.get(term) ?? 0));
      }
      return tfidf;
    });
  }

  /** Search for the top-K chunks most similar to the query. */
  search(query: string, topK: number = 5): SearchResult[] {
    const qTokens = tokenize(query);
    const qTF = termFrequency(qTokens);

    // Apply IDF to query
    const qVec = new Map<string, number>();
    for (const [term, tfVal] of qTF) {
      qVec.set(term, tfVal * (this.idf.get(term) ?? 0));
    }

    const scored = this.vectors.map((vec, i) => ({
      chunk: this.chunks[i]!,
      score: cosineSimilarity(qVec, vec),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((r) => r.score > 0);
  }

  get size(): number {
    return this.chunks.length;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private splitIntoChunks(source: string, text: string): Chunk[] {
    const chunks: Chunk[] = [];
    let start = 0;
    let idx = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push({
        id: `${source}::${idx}`,
        source,
        text: text.slice(start, end),
        startChar: start,
      });
      idx++;
      if (end >= text.length) break;
      start = end - this.overlap;
    }

    return chunks;
  }
}
