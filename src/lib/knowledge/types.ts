/** A markdown file from data/, before chunking. */
export interface SourceDocument {
  /** Stable id derived from the filename, e.g. "services-and-pricing". Used in citations. */
  id: string;
  title: string;
  /** Markdown body. */
  markdown: string;
}

/** One retrievable unit of knowledge: a document section (or part of a long one). */
export interface Chunk {
  /** Stable, human-readable id: `${docId}#${sectionSlug}` (+ `-2`, `-3` for split sections). */
  id: string;
  docId: string;
  docTitle: string;
  section: string;
  /** The section text shown to the model and used for citations. */
  content: string;
  /** What actually gets embedded: content prefixed with document title and section heading. */
  embedText: string;
  /** sha256 of embedText. If unchanged, ingest can skip re-embedding this chunk. */
  contentHash: string;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
  embeddingModel: string;
}

export interface ScoredChunk extends Chunk {
  /** Cosine similarity to the query, in [-1, 1]; higher is more similar. */
  score: number;
}
