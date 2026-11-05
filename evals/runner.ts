import { answerQuestion, type AssistantDeps } from "../src/lib/assistant/answer";
import type { AssistantReply, ReplyTrace } from "../src/lib/assistant/types";
import type { EvalCase, EvalCategory } from "./cases";

export interface EvalResult {
  id: string;
  category: EvalCategory;
  question: string;
  passed: boolean;
  failures: string[];
  reply: AssistantReply;
  trace: ReplyTrace;
}

export interface EvalSummary {
  total: number;
  passed: number;
  passRate: number;
  byCategory: Record<string, { total: number; passed: number }>;
}

/** Grades one reply against its expectations. Pure function, so it has its own unit tests. */
export function gradeReply(testCase: EvalCase, reply: AssistantReply): string[] {
  const failures: string[] = [];
  const e = testCase.expect;
  const answer = reply.answer.toLowerCase();

  const allowed = Array.isArray(e.outcome) ? e.outcome : [e.outcome];
  if (!allowed.includes(reply.outcome)) {
    failures.push(`outcome ${reply.outcome} (${reply.reason}), expected ${allowed.join("|")}`);
  }

  const expectedSafety = [...(e.safety ?? [])].sort().join(",");
  const actualSafety = reply.safety
    .map((s) => s.kind)
    .sort()
    .join(",");
  if (expectedSafety !== actualSafety) {
    failures.push(`safety [${actualSafety}], expected [${expectedSafety}]`);
  }

  if (reply.outcome === "answered") {
    if (e.citesDoc && !reply.citations.some((c) => c.docId === e.citesDoc)) {
      failures.push(`no citation from ${e.citesDoc}`);
    }
    for (const s of e.includes ?? []) {
      if (!answer.includes(s.toLowerCase())) failures.push(`answer missing "${s}"`);
    }
  }
  for (const s of e.excludes ?? []) {
    if (answer.includes(s.toLowerCase())) failures.push(`answer contains forbidden "${s}"`);
  }
  // "unsure" must always come with an offer of a person, or it is a dead end.
  if (reply.outcome === "unsure" && !reply.handoff) failures.push("unsure reply without handoff");

  return failures;
}

export async function runEvals(cases: EvalCase[], deps: AssistantDeps): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  // Sequential on purpose: keeps output order stable and stays well under
  // provider rate limits when running against a real API.
  for (const c of cases) {
    const { reply, trace } = await answerQuestion({ message: c.question }, deps);
    const failures = gradeReply(c, reply);
    results.push({
      id: c.id,
      category: c.category,
      question: c.question,
      passed: failures.length === 0,
      failures,
      reply,
      trace,
    });
  }
  return results;
}

export function summarize(results: EvalResult[]): EvalSummary {
  const byCategory: EvalSummary["byCategory"] = {};
  for (const r of results) {
    const bucket = (byCategory[r.category] ??= { total: 0, passed: 0 });
    bucket.total++;
    if (r.passed) bucket.passed++;
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    byCategory,
  };
}
