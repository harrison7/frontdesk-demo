import { BUSINESS } from "./business";
import type { SafetyAlert, SafetyKind } from "./types";

/**
 * Safety triage: deterministic pattern matching that runs before anything
 * else and does not depend on retrieval or the model.
 *
 * WHY rules instead of asking the LLM "is this an emergency?":
 * - It cannot be talked out of firing, and it works when the provider is down.
 * - The message is fixed text we reviewed, not something generated on the fly.
 * - It is fast and testable: every pattern below has unit tests.
 *
 * The rules lean toward over-triggering. A false positive costs one extra
 * paragraph of safety advice above a normal answer. A false negative could
 * leave someone standing in a house full of gas while chatting with a bot.
 * Patterns are still scoped to *active* hazards ("I smell gas", "basement is
 * flooding"), not topic mentions ("does the warranty cover flooding?"), so
 * the alert keeps its weight instead of appearing on every gas-furnace question.
 */

// Patterns run against normalized lowercase text. `[^.?!]{0,N}` means "within N
// characters, in the same sentence", which keeps matches local.
const RULES: Record<SafetyKind, RegExp[]> = {
  gas_leak: [
    /\b(smell|smells|smelled|smelling|odou?r|whiff|stinks?)\b[^.?!]{0,40}\b(gas|propane|rotten eggs?|sulfur|sulphur)\b/,
    /\b(gas|propane)\s+(leak|leaks|leaking|smell|smells|odou?r)\b/,
    /\bleak\w*\s+(natural\s+)?(gas|propane)\b/,
    /\brotten[- ]eggs?\b/,
    /\bhiss\w*\b[^.?!]{0,30}\bgas\b/,
  ],
  carbon_monoxide: [
    /\b(carbon monoxide|co)\b[^.?!]{0,30}\b(alarm|detector|monitor)\b[^.?!]{0,25}\b(going off|goes off|went off|sounding|beep\w*|alarming|triggered|chirp\w*|ringing)\b/,
    /\b(going off|went off|sounding|beeping)\b[^.?!]{0,40}\b(carbon monoxide|co)\b/,
    /\bcarbon monoxide\s+(leak|poisoning|exposure)\b/,
  ],
  flooding: [
    /\b(is|are|it's|keeps|started|currently|now|getting)\s+flood(ing|ed)\b/,
    /\bflood(ed|ing)\b[^.?!]{0,30}\b(basement|house|home|kitchen|bathroom|floor|room|garage|laundry)\b/,
    /\b(basement|house|home|kitchen|bathroom|floor|room|garage|laundry)\b[^.?!]{0,30}\bflood(ed|ing)\b/,
    /\b(burst|broken|busted|ruptured|split)\s+(water\s+)?(pipe|line|main)\b/,
    /\bpipes?\b[^.?!]{0,15}\b(burst|broke|exploded|split open)\b/,
    /\bwater\b[^.?!]{0,25}\b(everywhere|pouring|gushing|spraying|won't stop|wont stop|rising)\b/,
    /\bsewage\b[^.?!]{0,30}\b(backing up|backed up|overflow\w*|coming up)\b/,
  ],
};

/** Fixed, reviewed text. Order of keys = order shown when several hazards match. */
export const SAFETY_MESSAGES: Record<SafetyKind, string> = {
  gas_leak:
    "If you smell gas, leave the building now and take everyone with you. Don't flip light switches, use phones, or start a car inside or near the house, because a spark can ignite gas. Once you're safely away, call 911 or your gas utility's emergency line. Don't go back inside until they say it's safe.",
  carbon_monoxide:
    "If a carbon monoxide alarm is going off, get everyone outside into fresh air right away and call 911. Tell the dispatcher if anyone has a headache, dizziness, nausea, or confusion. Don't go back inside until emergency responders say it's safe.",
  flooding: `If water is flooding your home, shut off the main water valve if you can reach it safely. Stay out of standing water that could be near outlets or electrical equipment; if water may be reaching electrical, keep away and call 911. Then call our 24/7 emergency line at ${BUSINESS.emergencyPhone}.`,
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
}

export function detectSafetyIssues(text: string): SafetyAlert[] {
  const normalized = normalize(text);
  return (Object.keys(SAFETY_MESSAGES) as SafetyKind[])
    .filter((kind) => RULES[kind].some((re) => re.test(normalized)))
    .map((kind) => ({ kind, message: SAFETY_MESSAGES[kind] }));
}
