import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkDocuments } from "../src/lib/knowledge/chunker";
import { loadDocuments } from "../src/lib/knowledge/documents";
import { ingestChunks } from "../src/lib/knowledge/ingest";
import { PgVectorStore } from "../src/lib/knowledge/pg-vector-store";
import { InMemoryVectorStore } from "../src/lib/knowledge/vector-store";
import { FakeEmbeddingProvider } from "../src/lib/providers/fake-embeddings";

/**
 * Runs against a real Postgres + pgvector when TEST_DATABASE_URL is set
 * (CI sets it via a service container; locally, `docker compose up -d` and
 * export TEST_DATABASE_URL=postgres://frontdesk:frontdesk@localhost:5433/frontdesk).
 *
 * Skipping silently would hide a broken database path, so CI also sets
 * REQUIRE_DB_TESTS=1, which turns a missing URL into a failure.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.REQUIRE_DB_TESTS === "1") {
  throw new Error("REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is not set");
}

describe.skipIf(!url)("PgVectorStore (integration)", () => {
  const embedder = new FakeEmbeddingProvider(1536);
  // A dedicated table, so running tests never touches the dev knowledge base.
  const store = new PgVectorStore(url ?? "", embedder.dimensions, "kb_chunks_test");

  beforeAll(async () => {
    await store.reset();
    await store.ensureSchema();
  });
  afterAll(async () => {
    await store.reset();
    await store.close();
  });

  it("ingests idempotently and matches in-memory search results", async () => {
    const chunks = chunkDocuments(await loadDocuments());
    const first = await ingestChunks(chunks, store, embedder);
    expect(first.embedded).toBe(chunks.length);
    const second = await ingestChunks(chunks, store, embedder);
    expect(second).toEqual({ embedded: 0, unchanged: chunks.length, deleted: 0 });

    const memory = new InMemoryVectorStore();
    await ingestChunks(chunks, memory, embedder);
    const [query] = await embedder.embed(["What are your Saturday hours?"]);
    const fromPg = await store.search(query!, 4, embedder.model);
    const fromMemory = await memory.search(query!, 4, embedder.model);
    expect(fromPg.map((r) => r.id)).toEqual(fromMemory.map((r) => r.id));
    expect(fromPg[0]!.score).toBeCloseTo(fromMemory[0]!.score, 5);
  });

  it("ignores vectors from a different embedding model", async () => {
    const [query] = await embedder.embed(["hours"]);
    expect(await store.search(query!, 4, "some-other-model")).toEqual([]);
  });

  it("refuses to run against a table with a different vector size", async () => {
    const wrong = new PgVectorStore(url ?? "", 8, "kb_chunks_test");
    await expect(wrong.ensureSchema()).rejects.toThrow(/--reset/);
    await wrong.close();
  });
});
