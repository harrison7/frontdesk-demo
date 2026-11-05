import pg from "pg";
import type { EmbeddedChunk, ScoredChunk } from "./types";
import type { ChunkFingerprint, VectorStore } from "./vector-store";

export const DEFAULT_TABLE = "kb_chunks";

/**
 * pgvector-backed store.
 *
 * Index choice: no ANN index (HNSW/IVFFlat) on purpose. With a few dozen
 * chunks, an exact sequential scan takes well under a millisecond and is
 * exactly correct, while approximate indexes trade recall for speed that only
 * matters at tens of thousands of rows. `addHnswIndex()` notes how to add one.
 */
export class PgVectorStore implements VectorStore {
  private readonly pool: pg.Pool;
  private readonly table: string;

  /**
   * @param table Overridable so the integration test can use its own table
   *   without touching the dev knowledge base. It is interpolated into SQL
   *   (table names cannot be bind parameters), so it is validated as a plain
   *   identifier first.
   */
  constructor(
    connectionString: string,
    private readonly dimensions: number,
    table: string = DEFAULT_TABLE,
  ) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Invalid table name: ${table}`);
    this.table = table;
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  /**
   * Creates the extension and table if needed (safe to run repeatedly), and
   * fails loudly if the existing column was created for a different vector
   * size, because pgvector cannot store or compare mismatched dimensions.
   */
  async ensureSchema(): Promise<void> {
    await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id              text PRIMARY KEY,
        doc_id          text NOT NULL,
        doc_title       text NOT NULL,
        section         text NOT NULL,
        content         text NOT NULL,
        embed_text      text NOT NULL,
        content_hash    text NOT NULL,
        embedding_model text NOT NULL,
        embedding       vector(${this.dimensions}) NOT NULL,
        updated_at      timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await this.pool.query<{ type: string }>(
      `SELECT format_type(atttypid, atttypmod) AS type
         FROM pg_attribute
        WHERE attrelid = '${this.table}'::regclass AND attname = 'embedding'`,
    );
    const actual = rows[0]?.type;
    if (actual !== `vector(${this.dimensions})`) {
      throw new Error(
        `Table ${this.table} stores ${actual}, but EMBEDDING_DIMENSIONS=${this.dimensions}. ` +
          "Run `npm run ingest -- --reset` to rebuild the table for the new size.",
      );
    }
  }

  /** Drops the table. Used by `ingest --reset` when changing embedding size. */
  async reset(): Promise<void> {
    await this.pool.query(`DROP TABLE IF EXISTS ${this.table}`);
  }

  async listFingerprints(): Promise<Map<string, ChunkFingerprint>> {
    const { rows } = await this.pool.query<{
      id: string;
      content_hash: string;
      embedding_model: string;
    }>(`SELECT id, content_hash, embedding_model FROM ${this.table}`);
    return new Map(
      rows.map((r) => [r.id, { contentHash: r.content_hash, embeddingModel: r.embedding_model }]),
    );
  }

  async applyChanges(upserts: EmbeddedChunk[], deleteIds: string[]): Promise<void> {
    // One transaction, so the running app never sees a half-updated knowledge base.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (deleteIds.length > 0) {
        await client.query(`DELETE FROM ${this.table} WHERE id = ANY($1::text[])`, [deleteIds]);
      }
      for (const c of upserts) {
        await client.query(
          `INSERT INTO ${this.table}
             (id, doc_id, doc_title, section, content, embed_text, content_hash, embedding_model, embedding, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, now())
           ON CONFLICT (id) DO UPDATE SET
             doc_id = EXCLUDED.doc_id, doc_title = EXCLUDED.doc_title, section = EXCLUDED.section,
             content = EXCLUDED.content, embed_text = EXCLUDED.embed_text,
             content_hash = EXCLUDED.content_hash, embedding_model = EXCLUDED.embedding_model,
             embedding = EXCLUDED.embedding, updated_at = now()`,
          [
            c.id,
            c.docId,
            c.docTitle,
            c.section,
            c.content,
            c.embedText,
            c.contentHash,
            c.embeddingModel,
            toVectorLiteral(c.embedding),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async search(query: number[], topK: number, embeddingModel: string): Promise<ScoredChunk[]> {
    // `<=>` is pgvector's cosine *distance* (1 - cosine similarity).
    const { rows } = await this.pool.query<{
      id: string;
      doc_id: string;
      doc_title: string;
      section: string;
      content: string;
      embed_text: string;
      content_hash: string;
      score: number;
    }>(
      `SELECT id, doc_id, doc_title, section, content, embed_text, content_hash,
              1 - (embedding <=> $1::vector) AS score
         FROM ${this.table}
        WHERE embedding_model = $2
        ORDER BY embedding <=> $1::vector, id
        LIMIT $3`,
      [toVectorLiteral(query), embeddingModel, topK],
    );
    return rows.map((r) => ({
      id: r.id,
      docId: r.doc_id,
      docTitle: r.doc_title,
      section: r.section,
      content: r.content,
      embedText: r.embed_text,
      contentHash: r.content_hash,
      score: Number(r.score),
    }));
  }

  /**
   * Not called today. When the corpus grows past roughly 10k chunks, an HNSW
   * index makes search sub-linear at a small recall cost:
   *   CREATE INDEX ON kb_chunks USING hnsw (embedding vector_cosine_ops);
   */
  async addHnswIndex(): Promise<void> {
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_embedding_hnsw ON ${this.table} USING hnsw (embedding vector_cosine_ops)`,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** pgvector accepts vectors as text literals like "[0.1,0.2,0.3]". */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
