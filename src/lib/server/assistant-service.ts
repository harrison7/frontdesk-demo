import type { AssistantDeps } from "../assistant/answer";
import { loadConfig, type AppConfig } from "../config";
import { buildInMemoryIndex } from "../knowledge/memory-index";
import { PgVectorStore } from "../knowledge/pg-vector-store";
import { createRetriever } from "../knowledge/retrieve";
import type { VectorStore } from "../knowledge/vector-store";
import { createProviders } from "../providers";

/**
 * Builds the assistant's dependencies once per server process and reuses them.
 *
 * WHY a lazy singleton: the Postgres pool and (in memory mode) the embedded
 * index are expensive to create and safe to share across requests. Creating
 * them on first use instead of at import time keeps `next build` from trying
 * to reach a database or API.
 */
let pending: Promise<{ deps: AssistantDeps; config: AppConfig }> | undefined;

export function getAssistantService(): Promise<{ deps: AssistantDeps; config: AppConfig }> {
  pending ??= build().catch((err: unknown) => {
    pending = undefined; // let the next request retry instead of caching the failure
    throw err;
  });
  return pending;
}

async function build() {
  const config = loadConfig();
  const { chat, embeddings } = createProviders(config);

  let store: VectorStore;
  if (config.vectorStore === "memory") {
    store = await buildInMemoryIndex(embeddings);
  } else {
    store = new PgVectorStore(config.databaseUrl, embeddings.dimensions);
    await warnIfKnowledgeBaseEmpty(store);
  }

  return {
    deps: { chat, retriever: createRetriever(embeddings, store, config.retrieval) },
    config,
  };
}

/**
 * An empty or missing table does not crash the app (every answer just becomes
 * "I'm not sure"), which makes the cause easy to miss. Say it in the logs.
 */
async function warnIfKnowledgeBaseEmpty(store: VectorStore) {
  try {
    if ((await store.listFingerprints()).size === 0) {
      console.warn("[frontdesk] Knowledge base is empty. Run `npm run ingest`.");
    }
  } catch {
    console.warn(
      "[frontdesk] Could not read the knowledge base. Is Postgres running (`docker compose up -d`) " +
        "and has `npm run ingest` been run? Or set VECTOR_STORE=memory.",
    );
  }
}

/** Test hook: forget the cached service so the next call rebuilds from current env. */
export function resetAssistantServiceForTests() {
  pending = undefined;
}
