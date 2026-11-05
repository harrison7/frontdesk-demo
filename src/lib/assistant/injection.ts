/**
 * Prompt-injection screening for obvious attempts.
 *
 * This is the *least* important of the injection defenses, and it is
 * deliberately not the only one. Pattern lists are easy to evade with
 * rephrasing, so the real protections are structural:
 *   1. user text is escaped and fenced as data in the prompt (prompt.ts),
 *   2. the model only sees our documents, so it has nothing secret to leak,
 *   3. every reply is validated: citations must be real, and prices and phone
 *      numbers must appear in the cited docs (validate.ts),
 *   4. a canary marker detects system-prompt leakage.
 * This screen just short-circuits blatant attempts, so they never cost a model
 * call and get a consistent, polite reply.
 *
 * Patterns target instruction-manipulation phrasing, not topics, so normal
 * questions like "what are the rules for canceling?" are unaffected.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b[^.?!]{0,40}\b(instructions?|rules|prompts?|guidelines|directives|programming)\b/,
  /\b(system|developer|hidden|initial|original)\s+(prompt|message|instructions)\b/,
  /\byour\s+(system\s+)?(prompt|instructions)\b/,
  /\b(you are now|from now on you are|act as an?|pretend (to be|you are|you're)|roleplay as)\b/,
  /\b(jailbreak|dan mode|developer mode|god mode)\b/,
  /\bnew (instructions|rules)\b/,
  // Attempts to forge the prompt's own structure (see prompt.ts).
  /<\/?\s*(system|sources?|question|assistant|user)\b/,
];

export function looksLikePromptInjection(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  return INJECTION_PATTERNS.some((re) => re.test(normalized));
}
