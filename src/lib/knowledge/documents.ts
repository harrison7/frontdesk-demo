import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceDocument } from "./types";

export const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");

/**
 * Loads every markdown document from the data directory.
 * README.md is skipped because it describes the folder rather than the business.
 * Files are sorted so chunk order (and therefore test output) is deterministic.
 */
export async function loadDocuments(dir: string = DEFAULT_DATA_DIR): Promise<SourceDocument[]> {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const markdown = await readFile(path.join(dir, file), "utf8");
      const id = file.replace(/\.md$/, "");
      return { id, title: extractTitle(markdown) ?? id, markdown };
    }),
  );
}

function extractTitle(markdown: string): string | undefined {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
}
