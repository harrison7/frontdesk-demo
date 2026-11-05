import type { EmbeddingProvider } from "../providers/types";
import type { Chunk, EmbeddedChunk } from "./types";
import type { VectorStore } from "./vector-store";

export interface IngestResult {
  embedded: number;
  unchanged: number;
  deleted: number;
}

const EMBED_BATCH_SIZE = 64;

/**
 * Brings the store in line with `chunks`, doing as little work as possible.
 *
 * Idempotency works through fingerprints rather than "delete everything and
 * re-insert":
 * - a chunk whose id, content hash, and embedding model all match what is
 *   stored is skipped (no embedding API call, no write),
 * - a new or edited chunk, or one embedded by a different model, is re-embedded
 *   and upserted,
 * - a stored chunk that no longer exists in the docs is deleted.
 *
 * So running ingest twice in a row does zero embedding calls the second time,
 * and editing one section re-embeds only that section.
 */
export async function ingestChunks(
  chunks: Chunk[],
  store: VectorStore,
  embeddings: EmbeddingProvider,
): Promise<IngestResult> {
  const ids = new Set<string>();
  for (const c of chunks) {
    if (ids.has(c.id)) throw new Error(`Duplicate chunk id "${c.id}"; section headings must be unique.`);
    ids.add(c.id);
  }

  const existing = await store.listFingerprints();
  const toEmbed = chunks.filter((c) => {
    const fp = existing.get(c.id);
    return !fp || fp.contentHash !== c.contentHash || fp.embeddingModel !== embeddings.model;
  });
  const deleteIds = [...existing.keys()].filter((id) => !ids.has(id));

  const upserts: EmbeddedChunk[] = [];
  for (let i = 0; i < toEmbed.length; i += EMBED_BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embeddings.embed(batch.map((c) => c.embedText));
    batch.forEach((chunk, j) => {
      const embedding = vectors[j];
      if (!embedding) throw new Error(`Missing embedding for chunk ${chunk.id}`);
      upserts.push({ ...chunk, embedding, embeddingModel: embeddings.model });
    });
  }

  if (upserts.length > 0 || deleteIds.length > 0) {
    await store.applyChanges(upserts, deleteIds);
  }
  return {
    embedded: upserts.length,
    unchanged: chunks.length - upserts.length,
    deleted: deleteIds.length,
  };
}
