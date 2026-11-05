import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The pgvector integration test talks to a real database; give it room.
    testTimeout: 20_000,
  },
});
