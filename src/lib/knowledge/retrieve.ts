import type { EmbeddingProvider } from "../providers/types";
import type { ScoredChunk } from "./types";
import type { VectorStore } from "./vector-store";

export interface RetrieverOptions {
  topK: number;
  /** Chunks below this cosine similarity are dropped as irrelevant. */
  minScore: number;
}

export interface Retriever {
  retrieve(query: string): Promise<ScoredChunk[]>;
}

/**
 * Dense retrieval: embed the question, take the top-k nearest chunks, then
 * drop any below `minScore`.
 *
 * The threshold is what makes "I'm not sure" possible. Top-k alone always
 * returns k chunks, even for "what's the capital of France?", and a model
 * handed loosely related text is more tempted to improvise. Filtering means an
 * off-topic question reaches the model with no sources, or never reaches it.
 */
export function createRetriever(
  embeddings: EmbeddingProvider,
  store: VectorStore,
  options: RetrieverOptions,
): Retriever {
  return {
    async retrieve(query: string): Promise<ScoredChunk[]> {
      const [vector] = await embeddings.embed([query]);
      // A zero vector (e.g. fake embedding of "is it?") is similar to nothing.
      if (!vector || vector.every((x) => x === 0)) return [];
      const results = await store.search(vector, options.topK, embeddings.model);
      return results.filter((r) => r.score >= options.minScore);
    },
  };
}
