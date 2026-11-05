/**
 * Runs the eval set and fails (exit 1) if the pass rate is below a threshold.
 *
 *   npm run eval:ci                          # offline fake provider, threshold 0.9 (what CI runs)
 *   npm run eval:real                        # real provider from .env (AI_PROVIDER=openai etc.)
 *   npm run eval -- --provider openai --min-pass-rate 0.85 --verbose
 *   npm run eval -- --only safety-gas        # one case
 *
 * Retrieval always uses a fresh in-memory index built from data/, so results
 * measure the pipeline and docs, not whatever happens to be in a database.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import nextEnv from "@next/env";
import { loadConfig } from "../src/lib/config";
import { buildInMemoryIndex } from "../src/lib/knowledge/memory-index";
import { createRetriever } from "../src/lib/knowledge/retrieve";
import { createProviders } from "../src/lib/providers";
import { EVAL_CASES } from "../evals/cases";
import { runEvals, summarize } from "../evals/runner";

nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string" },
      "min-pass-rate": { type: "string", default: "0.9" },
      only: { type: "string" },
      verbose: { type: "boolean", default: false },
    },
  });

  const config = loadConfig({
    ...process.env,
    ...(values.provider ? { AI_PROVIDER: values.provider } : {}),
  });
  const minPassRate = Number(values["min-pass-rate"]);
  const { chat, embeddings } = createProviders(config);
  const store = await buildInMemoryIndex(embeddings);
  const retriever = createRetriever(embeddings, store, config.retrieval);

  const cases = values.only ? EVAL_CASES.filter((c) => c.id === values.only) : EVAL_CASES;
  console.log(
    `Running ${cases.length} evals with chat=${chat.name} embeddings=${embeddings.model} ` +
      `(minScore=${config.retrieval.minScore}, topK=${config.retrieval.topK})\n`,
  );

  const results = await runEvals(cases, { chat, retriever });
  for (const r of results) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(
      `${mark}  ${r.category.padEnd(12)} ${r.id.padEnd(28)} ${r.reply.outcome}/${r.reply.reason}`,
    );
    if (!r.passed) for (const f of r.failures) console.log(`        - ${f}`);
    if (values.verbose || !r.passed) {
      console.log(`        answer: ${r.reply.answer.replace(/\s+/g, " ").slice(0, 200)}`);
      console.log(
        `        retrieved: ${r.trace.retrieved.map((x) => `${x.id}(${x.score})`).join(", ")}`,
      );
    }
  }

  const summary = summarize(results);
  console.log("\nBy category:");
  for (const [cat, s] of Object.entries(summary.byCategory)) {
    console.log(`  ${cat.padEnd(13)} ${s.passed}/${s.total}`);
  }
  console.log(
    `\nPassed ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%), ` +
      `threshold ${(minPassRate * 100).toFixed(0)}%`,
  );

  const outDir = path.join(process.cwd(), "evals", "results");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "latest.json"),
    JSON.stringify({ provider: chat.name, summary, results }, null, 2),
  );

  if (summary.passRate < minPassRate) {
    console.error("Eval pass rate is below the threshold.");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
