/** What happened to a question, at the coarsest level. The widget and the evals key off this. */
export type Outcome =
  /** A grounded answer with at least one valid citation. */
  | "answered"
  /** We could not support an answer from the docs; the reply offers a human instead. */
  | "unsure"
  /** We declined on purpose (prompt injection, invalid input). */
  | "refused";

/** Why the pipeline ended where it did. Useful in logs, eval reports, and tests. */
export type ReasonCode =
  | "grounded"
  | "empty_input"
  | "input_too_long"
  | "prompt_injection"
  | "no_relevant_sources"
  | "model_declined"
  | "missing_citation"
  | "invalid_citation"
  | "unsupported_claim"
  | "prompt_leak"
  | "provider_error";

export type SafetyKind = "gas_leak" | "carbon_monoxide" | "flooding";

export interface SafetyAlert {
  kind: SafetyKind;
  message: string;
}

export interface Citation {
  /** The [n] marker number used in the answer text. */
  n: number;
  chunkId: string;
  docId: string;
  docTitle: string;
  section: string;
}

export interface AssistantReply {
  outcome: Outcome;
  reason: ReasonCode;
  /** Shown before the answer, always. Present whenever the message mentions a hazard. */
  safety: SafetyAlert[];
  answer: string;
  citations: Citation[];
  /** True when the UI should offer to connect the customer with a person. */
  handoff: boolean;
}

/** Internal details for evals and debugging. Never sent to the browser. */
export interface ReplyTrace {
  retrieved: { id: string; score: number }[];
  modelOutput?: string;
  detail?: string;
}
