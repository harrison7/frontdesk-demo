import type { AppConfig } from "../config";
import { FakeChatProvider } from "./fake-chat";
import { FakeEmbeddingProvider } from "./fake-embeddings";
import { OpenAICompatibleChatProvider, OpenAICompatibleEmbeddingProvider } from "./openai-compatible";
import type { ChatProvider, EmbeddingProvider } from "./types";

export interface Providers {
  chat: ChatProvider;
  embeddings: EmbeddingProvider;
}

/** The single place that turns configuration into concrete provider objects. */
export function createProviders(config: AppConfig): Providers {
  if (config.provider === "fake") {
    return {
      chat: new FakeChatProvider(),
      embeddings: new FakeEmbeddingProvider(config.embeddingDimensions),
    };
  }

  // The official OpenAI API requires a key; local OpenAI-compatible servers
  // (Ollama, LM Studio, vLLM) usually do not, so only insist for api.openai.com.
  if (!config.openai.apiKey && config.openai.baseUrl.includes("api.openai.com")) {
    throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY (see .env.example).");
  }
  const client = { baseUrl: config.openai.baseUrl, apiKey: config.openai.apiKey };
  return {
    chat: new OpenAICompatibleChatProvider(client, config.openai.chatModel),
    embeddings: new OpenAICompatibleEmbeddingProvider(
      client,
      config.openai.embeddingModel,
      config.embeddingDimensions,
    ),
  };
}

export type { ChatMessage, ChatProvider, EmbeddingProvider } from "./types";
