import type { ScoredChunk } from "../knowledge/types";
import { NOT_IN_SOURCES, PROMPT_CANARY } from "./prompt";
import type { Citation, ReasonCode } from "./types";

/**
 * Output validation: the guardrail that does not trust the model.
 *
 * The system prompt *asks* the model to cite and not invent prices; this file
 * *checks* that it did, in code, on every reply. If a check fails, the reply is
 * thrown away and the customer gets the "not sure, let me connect you" message.
 * Failing closed costs a slightly less helpful answer; failing open could
 * quote a price we never set.
 */

export type ValidationResult =
  | { ok: true; answer: string; citations: Citation[] }
  | { ok: false; reason: ReasonCode; detail?: string };

// [1] or [1, 3]
const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export function validateAnswer(raw: string, sources: ScoredChunk[]): ValidationResult {
  const answer = raw.trim();

  if (answer.includes(PROMPT_CANARY)) return { ok: false, reason: "prompt_leak" };
  if (answer.length === 0 || answer.includes(NOT_IN_SOURCES)) {
    return { ok: false, reason: "model_declined" };
  }

  // 1. Citations must exist and point at sources we actually provided.
  const cited: number[] = [];
  for (const match of answer.matchAll(CITATION_RE)) {
    for (const n of (match[1] ?? "").split(",").map((s) => Number(s.trim()))) {
      if (n < 1 || n > sources.length) {
        return { ok: false, reason: "invalid_citation", detail: `[${n}]` };
      }
      if (!cited.includes(n)) cited.push(n);
    }
  }
  if (cited.length === 0) return { ok: false, reason: "missing_citation" };

  // 2. Every price, percentage, and phone number must appear in a *cited*
  //    source. Checking cited sources (not all retrieved ones) means the
  //    citation shown to the customer actually supports the number.
  const citedText = cited.map((n) => sources[n - 1]?.content ?? "").join("\n");
  const allowed = extractClaims(citedText);
  const unsupported = [...extractClaims(answer)].filter((claim) => !allowed.has(claim));
  if (unsupported.length > 0) {
    return { ok: false, reason: "unsupported_claim", detail: unsupported.join(", ") };
  }

  const citations = cited.map((n): Citation => {
    const s = sources[n - 1]!;
    return { n, chunkId: s.id, docId: s.docId, docTitle: s.docTitle, section: s.section };
  });
  return { ok: true, answer, citations };
}

/**
 * Pulls out the facts that are most harmful to get wrong, normalized so
 * formatting differences do not matter: "$1,600" and "$1600" are both
 * "$1600", and "(801) 555-0142" is "tel:8015550142".
 */
export function extractClaims(text: string): Set<string> {
  const claims = new Set<string>();
  const digits = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.0+$/, "");

  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)) claims.add(`$${digits(m[1]!)}`);
  for (const m of text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:dollars|bucks)\b/gi)) {
    claims.add(`$${digits(m[1]!)}`);
  }
  for (const m of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi)) {
    claims.add(`${digits(m[1]!)}%`);
  }
  for (const m of text.matchAll(/(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b/g)) {
    claims.add(`tel:${m[0].replace(/\D/g, "")}`);
  }
  return claims;
}
