import type { EmbeddedChunk, ScoredChunk } from "./types";

/** What ingest needs to know about an already-stored chunk to decide whether to re-embed it. */
export interface ChunkFingerprint {
  contentHash: string;
  embeddingModel: string;
}

/**
 * Storage for embedded chunks. Two implementations:
 * - PgVectorStore: Postgres + pgvector, used by the running app.
 * - InMemoryVectorStore: used by unit tests and evals so they need no database.
 * Both are exercised against the same ingest code, so behavior stays aligned.
 */
export interface VectorStore {
  listFingerprints(): Promise<Map<string, ChunkFingerprint>>;
  /** Inserts/updates `upserts` and removes `deleteIds`, atomically where the backend allows. */
  applyChanges(upserts: EmbeddedChunk[], deleteIds: string[]): Promise<void>;
  /**
   * Returns the `topK` chunks most similar to `query`, considering only chunks
   * embedded with `embeddingModel`. Vectors from different models live in
   * different spaces, so comparing them would produce meaningless scores.
   */
  search(query: number[], topK: number, embeddingModel: string): Promise<ScoredChunk[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export class InMemoryVectorStore implements VectorStore {
  private readonly rows = new Map<string, EmbeddedChunk>();

  async listFingerprints(): Promise<Map<string, ChunkFingerprint>> {
    return new Map(
      [...this.rows].map(([id, r]) => [
        id,
        { contentHash: r.contentHash, embeddingModel: r.embeddingModel },
      ]),
    );
  }

  async applyChanges(upserts: EmbeddedChunk[], deleteIds: string[]): Promise<void> {
    for (const id of deleteIds) this.rows.delete(id);
    for (const row of upserts) this.rows.set(row.id, row);
  }

  async search(query: number[], topK: number, embeddingModel: string): Promise<ScoredChunk[]> {
    return [...this.rows.values()]
      .filter((r) => r.embeddingModel === embeddingModel)
      .map(({ embedding, embeddingModel: _model, ...chunk }) => ({
        ...chunk,
        score: cosineSimilarity(query, embedding),
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, topK);
  }

  get size(): number {
    return this.rows.size;
  }
}
