import { z } from "zod";

/**
 * All runtime configuration comes from environment variables, parsed once here
 * so the rest of the code receives a typed object instead of reading
 * `process.env` ad hoc. Every field has a default that runs fully offline.
 * See `.env.example` for documentation of each variable.
 */

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const EnvSchema = z.object({
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["fake", "openai"]).default("fake")),
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.url().default("https://api.openai.com/v1")),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CHAT_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-4o-mini")),
  EMBEDDING_MODEL: z.preprocess(emptyToUndefined, z.string().default("text-embedding-3-small")),
  EMBEDDING_DIMENSIONS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(16_000).default(1536),
  ),
  VECTOR_STORE: z.preprocess(emptyToUndefined, z.enum(["pg", "memory"]).default("pg")),
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().default("postgres://frontdesk:frontdesk@localhost:5433/frontdesk"),
  ),
  RETRIEVAL_MIN_SCORE: z.preprocess(emptyToUndefined, z.coerce.number().min(-1).max(1).optional()),
  RETRIEVAL_TOP_K: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).default(4)),
  ALLOWED_ORIGINS: z.preprocess(emptyToUndefined, z.string().default("")),
});

export type ProviderName = "fake" | "openai";

export interface AppConfig {
  provider: ProviderName;
  openai: { baseUrl: string; apiKey: string | undefined; chatModel: string; embeddingModel: string };
  embeddingDimensions: number;
  vectorStore: "pg" | "memory";
  databaseUrl: string;
  retrieval: { topK: number; minScore: number };
  allowedOrigins: string[];
}

/**
 * Similarity scores are not comparable across embedding models: the fake
 * bag-of-words hash vectors produce low cosine scores even for good matches
 * (few shared words), while real semantic embeddings rarely drop near zero
 * even for unrelated text. So the "is this relevant at all?" cutoff has to be
 * provider-specific. Both defaults were picked by running the eval set.
 */
const DEFAULT_MIN_SCORE: Record<ProviderName, number> = { fake: 0.08, openai: 0.3 };

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    provider: e.AI_PROVIDER,
    openai: {
      baseUrl: e.OPENAI_BASE_URL.replace(/\/+$/, ""),
      apiKey: e.OPENAI_API_KEY,
      chatModel: e.CHAT_MODEL,
      embeddingModel: e.EMBEDDING_MODEL,
    },
    embeddingDimensions: e.EMBEDDING_DIMENSIONS,
    vectorStore: e.VECTOR_STORE,
    databaseUrl: e.DATABASE_URL,
    retrieval: {
      topK: e.RETRIEVAL_TOP_K,
      minScore: e.RETRIEVAL_MIN_SCORE ?? DEFAULT_MIN_SCORE[e.AI_PROVIDER],
    },
    allowedOrigins: e.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
