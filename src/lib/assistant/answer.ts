import type { Retriever } from "../knowledge/retrieve";
import type { ScoredChunk } from "../knowledge/types";
import type { ChatProvider } from "../providers/types";
import { looksLikePromptInjection } from "./injection";
import { buildMessages, type HistoryTurn } from "./prompt";
import { RESPONSES } from "./responses";
import { detectSafetyIssues } from "./safety";
import type { AssistantReply, ReasonCode, ReplyTrace, SafetyAlert } from "./types";
import { validateAnswer } from "./validate";

export const MAX_MESSAGE_CHARS = 1000;

export interface AssistantDeps {
  chat: ChatProvider;
  retriever: Retriever;
}

export interface AssistantInput {
  message: string;
  history?: HistoryTurn[];
}

export interface AssistantResult {
  reply: AssistantReply;
  trace: ReplyTrace;
}

/**
 * The whole question-answering pipeline, in order:
 *
 *   1. safety triage     (always runs; its alerts are attached to every reply)
 *   2. input checks      (empty, too long)
 *   3. injection screen  (blatant attempts are refused without a model call)
 *   4. retrieval         (no relevant chunks -> "not sure", no model call)
 *   5. generation        (grounded prompt; provider errors -> "not sure")
 *   6. validation        (citations + prices/phones checked against sources)
 *
 * Every early exit produces a complete, safe reply, so callers never handle
 * exceptions for expected situations.
 */
export async function answerQuestion(
  input: AssistantInput,
  deps: AssistantDeps,
): Promise<AssistantResult> {
  const message = input.message.trim();
  // Safety runs on the full text first, so no later step (length limit,
  // injection screen, outage) can suppress a hazard warning.
  const safety = detectSafetyIssues(message);
  const trace: ReplyTrace = { retrieved: [] };

  const refuse = (reason: ReasonCode, answer: string): AssistantResult => ({
    reply: {
      outcome: "refused",
      reason,
      safety,
      answer,
      citations: [],
      handoff: safety.length > 0,
    },
    trace,
  });
  const unsure = (reason: ReasonCode, detail?: string): AssistantResult => ({
    reply: {
      outcome: "unsure",
      reason,
      safety,
      answer: unsureText(safety),
      citations: [],
      handoff: true,
    },
    trace: { ...trace, detail },
  });

  if (message.length === 0) return refuse("empty_input", RESPONSES.empty);
  if (message.length > MAX_MESSAGE_CHARS) return refuse("input_too_long", RESPONSES.tooLong);
  if (looksLikePromptInjection(message)) return refuse("prompt_injection", RESPONSES.injection);

  let sources: ScoredChunk[];
  try {
    sources = await deps.retriever.retrieve(message);
  } catch (err) {
    return unsure("provider_error", errorMessage(err));
  }
  trace.retrieved = sources.map((s) => ({ id: s.id, score: round(s.score) }));
  if (sources.length === 0) return unsure("no_relevant_sources");

  let modelOutput: string;
  try {
    modelOutput = await deps.chat.complete(buildMessages(message, sources, input.history));
  } catch (err) {
    return unsure("provider_error", errorMessage(err));
  }
  trace.modelOutput = modelOutput;

  const result = validateAnswer(modelOutput, sources);
  if (!result.ok) return unsure(result.reason, result.detail);

  return {
    reply: {
      outcome: "answered",
      reason: "grounded",
      safety,
      answer: result.answer,
      citations: result.citations,
      handoff: safety.length > 0,
    },
    trace,
  };
}

function unsureText(safety: SafetyAlert[]): string {
  // In a hazard situation, "would you like me to connect you?" is too slow;
  // point straight at the 24/7 line instead.
  return safety.length > 0 ? RESPONSES.unsureEmergency : RESPONSES.unsure;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
