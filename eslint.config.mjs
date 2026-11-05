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
    rules: {
      // `const { embedding, ...rest } = row` is the idiomatic way to omit
      // fields; don't flag the omitted ones as unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "evals/results/**"],
  },
];

export default config;
