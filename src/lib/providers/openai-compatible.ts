import type { ChatMessage, ChatProvider, EmbeddingProvider } from "./types";

/**
 * Minimal clients for the OpenAI-compatible REST API (`/chat/completions` and
 * `/embeddings`). Many vendors and local servers implement this same API, so
 * one small client covers them all via OPENAI_BASE_URL.
 *
 * WHY plain fetch instead of an SDK: two endpoints, a few fields each. Writing
 * them out keeps the dependency list short and makes the wire format visible
 * for anyone studying the code.
 */

interface ClientOptions {
  baseUrl: string;
  apiKey: string | undefined;
  /** Abort a request that takes longer than this. A hung call should fail fast to the fallback. */
  timeoutMs?: number;
}

async function postJson<T>(opts: ClientOptions, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${opts.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  if (!res.ok) {
    // Include the status and a bounded slice of the body for debugging, but
    // never the request (which could contain the API key in headers).
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`AI provider request to ${path} failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export class OpenAICompatibleChatProvider implements ChatProvider {
  readonly name: string;

  constructor(
    private readonly opts: ClientOptions,
    private readonly model: string,
  ) {
    this.name = `openai:${model}`;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const data = await postJson<{ choices?: { message?: { content?: string | null } }[] }>(
      this.opts,
      "/chat/completions",
      {
        model: this.model,
        messages,
        // Front-desk answers should be consistent, not creative.
        temperature: 0,
        max_tokens: 400,
      },
    );
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI provider returned no message content");
    return content;
  }
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly opts: ClientOptions,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const data = await postJson<{ data?: { index: number; embedding: number[] }[] }>(
      this.opts,
      "/embeddings",
      { model: this.model, input: texts, dimensions: this.dimensions },
    );
    const rows = data.data ?? [];
    // The API returns an `index` per row; sort by it rather than trusting order.
    const vectors = [...rows].sort((a, b) => a.index - b.index).map((r) => r.embedding);
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== this.dimensions)) {
      throw new Error(
        `Embedding response did not match request (expected ${texts.length} vectors of ${this.dimensions} dims). ` +
          "Check EMBEDDING_MODEL and EMBEDDING_DIMENSIONS.",
      );
    }
    return vectors;
  }
}
