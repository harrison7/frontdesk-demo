import type { EmbeddingProvider } from "../providers/types";
import { chunkDocuments } from "./chunker";
import { DEFAULT_DATA_DIR, loadDocuments } from "./documents";
import { ingestChunks } from "./ingest";
import { InMemoryVectorStore } from "./vector-store";

/**
 * Loads, chunks, and embeds data/ into a fresh in-memory store, through the
 * same ingest code the pgvector path uses. Used by tests, evals, and
 * VECTOR_STORE=memory, so they all see exactly what a fresh `npm run ingest`
 * would produce, with no dependence on whatever is in a database.
 */
export async function buildInMemoryIndex(
  embeddings: EmbeddingProvider,
  dataDir: string = DEFAULT_DATA_DIR,
): Promise<InMemoryVectorStore> {
  const store = new InMemoryVectorStore();
  await ingestChunks(chunkDocuments(await loadDocuments(dataDir)), store, embeddings);
  return store;
}
