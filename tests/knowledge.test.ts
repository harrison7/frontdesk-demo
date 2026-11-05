import { describe, expect, it } from "vitest";
import { chunkDocument, chunkDocuments, MAX_CHUNK_CHARS } from "../src/lib/knowledge/chunker";
import { loadDocuments } from "../src/lib/knowledge/documents";
import { ingestChunks } from "../src/lib/knowledge/ingest";
import { createRetriever } from "../src/lib/knowledge/retrieve";
import { InMemoryVectorStore } from "../src/lib/knowledge/vector-store";
import { FakeEmbeddingProvider } from "../src/lib/providers/fake-embeddings";
import type { EmbeddingProvider } from "../src/lib/providers/types";

/** Wraps an embedder and counts how many texts it was asked to embed. */
function countingEmbedder(inner: EmbeddingProvider, model = inner.model) {
  const counter = { texts: 0 };
  const embedder: EmbeddingProvider = {
    model,
    dimensions: inner.dimensions,
    embed: async (texts) => {
      counter.texts += texts.length;
      return inner.embed(texts);
    },
  };
  return { embedder, counter };
}

describe("chunkDocument", () => {
  const doc = {
    id: "hours",
    title: "Hours",
    markdown:
      "# Hours\n\n<!-- SYNTHETIC -->\nIntro line.\n\n## Office hours\n\n- Mon: 9-5\n\n## Holidays\n\nClosed on holidays.\n",
  };

  it("splits on ## headings, keeps pre-heading text as Overview, strips comments", () => {
    const chunks = chunkDocument(doc);
    expect(chunks.map((c) => c.id)).toEqual([
      "hours#overview",
      "hours#office-hours",
      "hours#holidays",
    ]);
    expect(chunks[0]!.content).toBe("Intro line.");
    expect(chunks.some((c) => c.content.includes("SYNTHETIC"))).toBe(false);
  });

  it("prefixes embedded text with document and section for context", () => {
    expect(chunkDocument(doc)[2]!.embedText).toBe("Hours > Holidays\n\nClosed on holidays.");
  });

  it("splits oversized sections at paragraph boundaries", () => {
    const para = "Lorem ipsum dolor sit amet. ".repeat(20).trim();
    const long = { id: "x", title: "X", markdown: `## Big\n\n${para}\n\n${para}\n\n${para}` };
    const chunks = chunkDocument(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => `x#big-${i + 1}`));
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });

  it("disambiguates duplicate headings", () => {
    const dup = { id: "d", title: "D", markdown: "## Notes\n\na\n\n## Notes\n\nb" };
    expect(chunkDocument(dup).map((c) => c.id)).toEqual(["d#notes", "d#notes-2"]);
  });
});

describe("real data/ documents", () => {
  it("load and chunk into unique, non-empty chunks", async () => {
    const docs = await loadDocuments();
    expect(docs.map((d) => d.id)).toEqual([
      "emergency-policy",
      "faq",
      "hours",
      "maintenance-plans",
      "service-area",
      "services-and-pricing",
      "warranty",
    ]);
    const chunks = chunkDocuments(docs);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
  });
});

describe("ingestChunks", () => {
  const base = new FakeEmbeddingProvider(64);
  const mk = (id: string, content: string) =>
    chunkDocument({ id, title: id, markdown: `## S\n\n${content}` })[0]!;

  it("is idempotent: a second run embeds nothing", async () => {
    const store = new InMemoryVectorStore();
    const { embedder, counter } = countingEmbedder(base);
    const chunks = [mk("a", "alpha"), mk("b", "beta")];

    expect(await ingestChunks(chunks, store, embedder)).toEqual({
      embedded: 2,
      unchanged: 0,
      deleted: 0,
    });
    expect(await ingestChunks(chunks, store, embedder)).toEqual({
      embedded: 0,
      unchanged: 2,
      deleted: 0,
    });
    expect(counter.texts).toBe(2);
    expect(store.size).toBe(2);
  });

  it("re-embeds only edited chunks and deletes removed ones", async () => {
    const store = new InMemoryVectorStore();
    await ingestChunks([mk("a", "alpha"), mk("b", "beta")], store, base);
    const result = await ingestChunks([mk("a", "alpha edited")], store, base);
    expect(result).toEqual({ embedded: 1, unchanged: 0, deleted: 1 });
    expect(store.size).toBe(1);
  });

  it("re-embeds everything when the embedding model changes", async () => {
    const store = new InMemoryVectorStore();
    const chunks = [mk("a", "alpha")];
    await ingestChunks(chunks, store, base);
    const { embedder } = countingEmbedder(base, "other-model");
    expect((await ingestChunks(chunks, store, embedder)).embedded).toBe(1);
  });

  it("rejects duplicate chunk ids", async () => {
    const c = mk("a", "alpha");
    await expect(ingestChunks([c, c], new InMemoryVectorStore(), base)).rejects.toThrow(
      /Duplicate chunk id/,
    );
  });
});

describe("retriever", () => {
  it("returns relevant chunks first and filters by min score", async () => {
    const embedder = new FakeEmbeddingProvider(1536);
    const store = new InMemoryVectorStore();
    await ingestChunks(chunkDocuments(await loadDocuments()), store, embedder);
    const retriever = createRetriever(embedder, store, { topK: 4, minScore: 0.08 });

    const hits = await retriever.retrieve("How much does a tankless water heater cost?");
    expect(hits[0]?.id).toBe("services-and-pricing#water-heaters");

    for (const hit of hits) expect(hit.score).toBeGreaterThanOrEqual(0.08);

    // Hash collisions can give an unrelated chunk a small nonzero score, so
    // off-topic handling is not left to this threshold alone; see the
    // assistant pipeline tests. Here we only check that the filter applies.
    const strict = createRetriever(embedder, store, { topK: 4, minScore: 0.99 });
    expect(await strict.retrieve("How much does a tankless water heater cost?")).toEqual([]);
  });
});
