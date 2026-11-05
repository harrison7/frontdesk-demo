import { NOT_IN_SOURCES, parseGroundedPrompt, type ParsedPromptSource } from "../assistant/prompt";
import { contentTerms } from "../text";
import type { ChatMessage, ChatProvider } from "./types";

/**
 * A script lets a test dictate the "model's" reply, e.g. to simulate a model
 * that hallucinates a price, so we can prove the validator catches it.
 * Return `undefined` to fall through to the default extractive behavior.
 */
export type ChatScript = (messages: ChatMessage[]) => string | undefined;

/**
 * Offline stand-in for a chat model.
 *
 * Default behavior is *extractive*: it parses the grounded prompt, picks the
 * source sentences that share the most words with the question, and returns
 * them verbatim with [n] citations. If nothing overlaps enough it replies
 * NOT_IN_SOURCES, as the real model is instructed to.
 *
 * Because it only copies source text, it never hallucinates, so it cannot test
 * the hallucination guardrails by itself. That is what `script` is for.
 */
export class FakeChatProvider implements ChatProvider {
  readonly name = "fake";
  /** Every conversation this provider was asked to complete (for test assertions). */
  readonly calls: ChatMessage[][] = [];

  constructor(private readonly script?: ChatScript) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const scripted = this.script?.(messages);
    if (scripted !== undefined) return scripted;

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const { sources, question } = parseGroundedPrompt(lastUser?.content ?? "");
    if (!question || sources.length === 0) return NOT_IN_SOURCES;
    return extractiveAnswer(question, sources);
  }
}

interface Statement {
  text: string;
  sourceId: number;
  score: number;
  order: number;
}

const MAX_STATEMENTS = 2;

function extractiveAnswer(question: string, sources: ParsedPromptSource[]): string {
  const questionTerms = new Set(contentTerms(question));
  if (questionTerms.size === 0) return NOT_IN_SOURCES;

  const statements: Statement[] = [];
  for (const source of sources) {
    for (const text of splitStatements(source.content)) {
      const terms = new Set(contentTerms(text));
      let score = 0;
      for (const t of questionTerms) if (terms.has(t)) score++;
      statements.push({ text, sourceId: source.id, score, order: statements.length });
    }
  }

  // Require the statement to cover a reasonable share of the question's words,
  // so a single incidental shared word ("water") does not count as an answer.
  const minScore = Math.max(1, Math.ceil(questionTerms.size / 3));
  const best = statements
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_STATEMENTS);

  if (best.length === 0) return NOT_IN_SOURCES;
  return best
    .sort((a, b) => a.order - b.order)
    .map((s) => `${s.text} [${s.sourceId}]`)
    .join(" ");
}

/** Splits a section into bullet lines and sentences, without markdown markers. */
function splitStatements(content: string): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((s) => s.trim())
    .filter(Boolean);
}
