import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextVitals,
  ...nextTypescript,
  // Prettier owns formatting; this turns off ESLint rules that would fight it.
  prettier,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "evals/results/**"],
  },
];

export default config;
