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
  order: number;
  /** Content words of the statement plus its section heading. */
  terms: Set<string>;
}

const MAX_STATEMENTS = 2;

/**
 * Greedy extractive QA:
 * 1. Candidates are the bullet lines and paragraphs of each source. Each one
 *    also "knows" its section heading, because headings carry meaning the line
 *    leaves implicit (FAQ heading "Do you offer senior discounts?" over the
 *    line "Customers 65 or older ... receive 10% off").
 * 2. Pick the candidate covering the most question words (ties go to the
 *    higher-ranked source), then the one covering the most *still uncovered*
 *    words. That favors complementary facts over two near-duplicates.
 * 3. If the first pick covers too little of the question, decline.
 */
function extractiveAnswer(question: string, sources: ParsedPromptSource[]): string {
  const questionTerms = new Set(contentTerms(question));
  if (questionTerms.size === 0) return NOT_IN_SOURCES;

  const statements: Statement[] = [];
  for (const source of sources) {
    const headingTerms = contentTerms(source.section);
    for (const text of splitStatements(source.content)) {
      const terms = new Set([...contentTerms(text), ...headingTerms]);
      statements.push({ text, sourceId: source.id, order: statements.length, terms });
    }
  }

  // A single incidental shared word ("water") should not count as an answer
  // to a longer question, so the first pick must cover a third of its words.
  const minFirstGain = Math.max(1, Math.ceil(questionTerms.size / 3));
  const uncovered = new Set(questionTerms);
  const picked: Statement[] = [];

  while (picked.length < MAX_STATEMENTS) {
    let best: Statement | undefined;
    let bestGain = 0;
    for (const s of statements) {
      if (picked.includes(s)) continue;
      const gain = [...uncovered].filter((t) => s.terms.has(t)).length;
      if (gain > bestGain) {
        best = s;
        bestGain = gain;
      }
    }
    if (!best || bestGain === 0) break;
    if (picked.length === 0 && bestGain < minFirstGain) return NOT_IN_SOURCES;
    picked.push(best);
    for (const t of best.terms) uncovered.delete(t);
  }

  if (picked.length === 0) return NOT_IN_SOURCES;
  return picked
    .sort((a, b) => a.order - b.order)
    .map((s) => `${s.text} [${s.sourceId}]`)
    .join(" ");
}

/** Splits a section into bullet lines and paragraphs, without markdown markers. */
function splitStatements(content: string): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
