import { describe, expect, it } from "vitest";
import type { AssistantReply } from "../src/lib/assistant/types";
import type { EvalCase } from "../evals/cases";
import { EVAL_CASES } from "../evals/cases";
import { gradeReply } from "../evals/runner";

const reply = (overrides: Partial<AssistantReply> = {}): AssistantReply => ({
  outcome: "answered",
  reason: "grounded",
  safety: [],
  answer: "A furnace tune-up is $109 [1].",
  citations: [{ n: 1, chunkId: "p#x", docId: "services-and-pricing", docTitle: "P", section: "X" }],
  handoff: false,
  ...overrides,
});

const testCase = (expect: EvalCase["expect"]): EvalCase => ({
  id: "t",
  category: "normal",
  question: "q",
  expect,
});

describe("gradeReply", () => {
  it("passes a reply that meets every expectation", () => {
    const c = testCase({
      outcome: "answered",
      citesDoc: "services-and-pricing",
      includes: ["$109"],
    });
    expect(gradeReply(c, reply())).toEqual([]);
  });

  it("reports wrong outcome, missing citation, missing and forbidden text", () => {
    const c = testCase({
      outcome: "unsure",
      citesDoc: "faq",
      includes: ["$89"],
      excludes: ["$109"],
    });
    expect(gradeReply(c, reply())).toHaveLength(4);
  });

  it("fails unexpected safety alerts (false positives count)", () => {
    const c = testCase({ outcome: "answered" });
    const r = reply({ safety: [{ kind: "gas_leak", message: "..." }] });
    expect(gradeReply(c, r)[0]).toMatch(/safety/);
  });

  it("requires a handoff whenever the outcome is unsure", () => {
    const c = testCase({ outcome: "unsure" });
    expect(gradeReply(c, reply({ outcome: "unsure", handoff: false }))).toContain(
      "unsure reply without handoff",
    );
  });
});

describe("EVAL_CASES", () => {
  it("has unique ids and covers every category", () => {
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
    expect(new Set(EVAL_CASES.map((c) => c.category))).toEqual(
      new Set(["normal", "edge", "safety", "out_of_scope", "adversarial"]),
    );
  });
});
