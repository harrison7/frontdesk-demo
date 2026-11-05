/**
 * The two capabilities the assistant needs from an AI vendor. Everything else
 * in the app depends only on these interfaces, which is what lets tests and CI
 * swap in deterministic fakes and lets you switch vendors with env vars.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatProvider {
  /** Human-readable id, e.g. "fake" or "openai:gpt-4o-mini" (shown in eval reports). */
  readonly name: string;
  /** Returns the assistant's reply text for the given conversation. */
  complete(messages: ChatMessage[]): Promise<string>;
}

export interface EmbeddingProvider {
  /**
   * Identifies the vector space. Stored next to every chunk so ingest can
   * detect that vectors were made by a different model and must be redone.
   */
  readonly model: string;
  readonly dimensions: number;
  /** Embeds each input text; output[i] corresponds to texts[i]. */
  embed(texts: string[]): Promise<number[][]>;
}
