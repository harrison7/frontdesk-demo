import { createHash } from "node:crypto";
import type { Chunk, SourceDocument } from "./types";

/**
 * Heading-aware chunking.
 *
 * WHY split on `##` sections instead of fixed-size windows:
 * - Business documents are already organized by topic, and each section
 *   answers roughly one kind of question ("Emergency fees", "Holidays").
 *   Splitting there keeps a complete fact (a price list, a policy) in one chunk
 *   instead of cutting it mid-list.
 * - Citations become meaningful: "Hours and Scheduling > Holidays" tells a
 *   customer, and a reviewer, exactly where the answer came from.
 * - Every chunk's embedded text is prefixed with "Document > Section", so a
 *   short section like "Sunday: closed." still carries its topic.
 *
 * Sections longer than MAX_CHUNK_CHARS are packed into several parts at
 * paragraph boundaries. No overlap is used: parts repeat the heading prefix,
 * which gives the context that overlap usually provides, without duplicating
 * facts across chunks (duplicates crowd out other results in top-k).
 */
export const MAX_CHUNK_CHARS = 1200;

const OVERVIEW_SECTION = "Overview";

export function chunkDocument(doc: SourceDocument): Chunk[] {
  const sections = splitSections(stripComments(doc.markdown));
  const usedSlugs = new Map<string, number>();
  const chunks: Chunk[] = [];

  for (const { heading, body } of sections) {
    const baseSlug = uniqueSlug(slugify(heading), usedSlugs);
    const parts = packParagraphs(body, MAX_CHUNK_CHARS);
    parts.forEach((content, i) => {
      const id = `${doc.id}#${baseSlug}${parts.length > 1 ? `-${i + 1}` : ""}`;
      const embedText = `${doc.title} > ${heading}\n\n${content}`;
      chunks.push({
        id,
        docId: doc.id,
        docTitle: doc.title,
        section: heading,
        content,
        embedText,
        contentHash: sha256(embedText),
      });
    });
  }
  return chunks;
}

export function chunkDocuments(docs: SourceDocument[]): Chunk[] {
  return docs.flatMap(chunkDocument);
}

/** HTML comments hold notes for maintainers (like the synthetic-data notice), not customer-facing facts. */
function stripComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

interface Section {
  heading: string;
  body: string;
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let heading = OVERVIEW_SECTION;
  let lines: string[] = [];

  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ heading, body });
    lines = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (/^#\s/.test(line)) continue; // the document title is metadata, not content
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2?.[1]) {
      flush();
      heading = h2[1].trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Greedily packs paragraphs into parts of at most `maxChars` (oversized paragraphs split by sentence). */
function packParagraphs(body: string, maxChars: number): string[] {
  if (body.length <= maxChars) return [body];

  const units = body
    .split(/\n\s*\n/)
    .flatMap((p) => (p.length <= maxChars ? [p.trim()] : p.split(/(?<=[.!?])\s+/)))
    .filter(Boolean);

  const parts: string[] = [];
  let current = "";
  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length > maxChars && current) {
      parts.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function uniqueSlug(slug: string, used: Map<string, number>): string {
  const count = (used.get(slug) ?? 0) + 1;
  used.set(slug, count);
  return count === 1 ? slug : `${slug}-${count}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
