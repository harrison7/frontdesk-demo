/**
 * Small, dependency-free text helpers shared by the fake providers.
 *
 * These are intentionally simple. They exist so the offline fake embedding
 * and fake chat behave like a crude keyword search engine: good enough to
 * exercise the whole pipeline deterministically, not a substitute for real
 * semantic embeddings.
 */

// Words that carry little meaning for matching a question to a document.
// Without this list, "what are your ..." questions would match every chunk.
const STOPWORDS = new Set(
  (
    "a about above after again all also am an and any are as at be been before being below " +
    "between both but by can could did do does doing done down during each else ever every " +
    "few for from further get gets got had has have having he her here hers him his how i if " +
    "in into is it its itself just let like me might more most must my myself no nor not now " +
    "of off on once only or other our ours out over own please same she should so some such " +
    "than that the their theirs them then there these they this those through to too under " +
    "until up us very was we were what when where which while who whom why will with would " +
    "yes you your yours yourself hi hello hey thanks thank ok okay much many"
  ).split(" "),
);

/**
 * A deliberately tiny suffix stripper (not a full Porter stemmer). It maps
 * common inflections onto one form so "leaks", "leaking" and "leaked" match.
 */
export function stem(word: string): string {
  let w = word;
  if (w.endsWith("'s")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Lowercase, split on non-alphanumerics, drop stopwords, stem. */
export function contentTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/**
 * 32-bit FNV-1a hash. Chosen because it is a few lines, fast, has decent
 * distribution for short strings, and is identical on every platform, which
 * is what makes the fake embeddings deterministic.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
