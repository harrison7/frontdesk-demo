/**
 * Chunks data/*.md, embeds changed chunks, and syncs them into pgvector.
 *
 *   npm run ingest              # incremental and idempotent; safe to re-run
 *   npm run ingest -- --reset   # drop and rebuild the table (needed after changing EMBEDDING_DIMENSIONS)
 */
import nextEnv from "@next/env";
import { loadConfig } from "../src/lib/config";
import { chunkDocuments } from "../src/lib/knowledge/chunker";
import { loadDocuments } from "../src/lib/knowledge/documents";
import { ingestChunks } from "../src/lib/knowledge/ingest";
import { PgVectorStore } from "../src/lib/knowledge/pg-vector-store";
import { createProviders } from "../src/lib/providers";

// Load .env / .env.local exactly the way `next dev` does, so scripts and the
// app always agree on configuration.
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const reset = process.argv.includes("--reset");
  const config = loadConfig();
  const { embeddings } = createProviders(config);

  const docs = await loadDocuments();
  const chunks = chunkDocuments(docs);
  console.log(`Loaded ${docs.length} documents -> ${chunks.length} chunks`);

  const store = new PgVectorStore(config.databaseUrl, embeddings.dimensions);
  try {
    if (reset) {
      await store.reset();
      console.log("Dropped existing chunk table (--reset)");
    }
    await store.ensureSchema();
    const result = await ingestChunks(chunks, store, embeddings);
    console.log(
      `Embedding model: ${embeddings.model} (${embeddings.dimensions} dims)\n` +
        `Embedded/updated: ${result.embedded}  Unchanged: ${result.unchanged}  Deleted: ${result.deleted}`,
    );
  } finally {
    await store.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && /ECONNREFUSED/.test(String(err.stack))) {
    console.error("Is Postgres running? Start it with `docker compose up -d`.");
  }
  process.exit(1);
});
