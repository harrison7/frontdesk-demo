import { contentTerms, fnv1a } from "../text";
import type { EmbeddingProvider } from "./types";

/**
 * Deterministic, offline embeddings using the "hashing trick".
 *
 * Each content word is hashed to one of `dimensions` buckets and adds +1 or -1
 * there (a second hash bit picks the sign, so colliding words tend to cancel
 * instead of piling up). The vector is then L2-normalized, so cosine
 * similarity equals the dot product and roughly measures shared vocabulary.
 *
 * Properties that matter:
 * - Same text, same vector, on every machine: tests and CI are reproducible.
 * - No network or API key needed.
 * - It only understands exact (stemmed) word overlap. "Boiler" will not match
 *   "furnace". That is fine for exercising the pipeline; semantic quality is
 *   measured by running the evals against a real provider.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fake-hash-v1";

  constructor(readonly dimensions: number) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const term of contentTerms(text)) {
      const h = fnv1a(term);
      const index = h % this.dimensions;
      const sign = (fnv1a(`sign:${term}`) & 1) === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }
    return normalize(vector);
  }
}

export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  // An all-stopword input ("is it?") has no terms; return the zero vector,
  // which scores 0 against everything and so is treated as "no match".
  return norm === 0 ? vector : vector.map((x) => x / norm);
}
