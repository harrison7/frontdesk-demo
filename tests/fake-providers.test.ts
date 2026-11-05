import { describe, expect, it } from "vitest";
import { buildMessages, NOT_IN_SOURCES } from "../src/lib/assistant/prompt";
import type { ScoredChunk } from "../src/lib/knowledge/types";
import { cosineSimilarity } from "../src/lib/knowledge/vector-store";
import { FakeChatProvider } from "../src/lib/providers/fake-chat";
import { FakeEmbeddingProvider } from "../src/lib/providers/fake-embeddings";

describe("FakeEmbeddingProvider", () => {
  const embedder = new FakeEmbeddingProvider(256);

  it("is deterministic and unit length", async () => {
    const [a] = await embedder.embed(["Water heater replacement prices"]);
    const [b] = await embedder.embed(["Water heater replacement prices"]);
    expect(a).toEqual(b);
    const norm = Math.sqrt(a!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it("scores shared vocabulary above unrelated text", async () => {
    const [q, related, unrelated] = await embedder.embed([
      "How much is a water heater?",
      "Tank water heater replacement, installed: $1,600 to $2,600.",
      "We are closed on Sunday.",
    ]);
    expect(cosineSimilarity(q!, related!)).toBeGreaterThan(cosineSimilarity(q!, unrelated!));
  });

  it("returns the zero vector for text with no content words", async () => {
    const [v] = await embedder.embed(["is it?"]);
    expect(v!.every((x) => x === 0)).toBe(true);
  });
});

function chunk(content: string, section = "Section"): ScoredChunk {
  return {
    id: `doc#${section}`,
    docId: "doc",
    docTitle: "Doc",
    section,
    content,
    embedText: content,
    contentHash: "x",
    score: 1,
  };
}

describe("FakeChatProvider", () => {
  it("answers extractively with citations from the prompt's sources", async () => {
    const chat = new FakeChatProvider();
    const reply = await chat.complete(
      buildMessages("When are you open on Saturday?", [
        chunk("- Saturday: 8:00 a.m. to 2:00 p.m.\n- Sunday: closed."),
      ]),
    );
    expect(reply).toBe("Saturday: 8:00 a.m. to 2:00 p.m. [1]");
  });

  it("replies NOT_IN_SOURCES when sources do not overlap the question", async () => {
    const chat = new FakeChatProvider();
    const reply = await chat.complete(
      buildMessages("Do you sell pizza?", [chunk("Furnace tune-up: $109.")]),
    );
    expect(reply).toBe(NOT_IN_SOURCES);
  });

  it("lets a script override the reply and records calls", async () => {
    const chat = new FakeChatProvider(() => "scripted");
    expect(await chat.complete([{ role: "user", content: "hi" }])).toBe("scripted");
    expect(chat.calls).toHaveLength(1);
  });
});
