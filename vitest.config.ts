import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { NODE_ONLY_WORKER_TESTS } from "./tests/worker/node-only-globs.ts";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "cloudflare:workers": resolve(
        import.meta.dirname,
        "tests/stubs/cloudflare-workers.ts",
      ),
    },
  },
  test: {
    environment: "node",
    // Workers suite runs under vitest.worker.config.ts (real D1 bindings)
    include: [
      "tests/client/**/*.test.ts",
      "tests/client/**/*.test.tsx",
      "tests/lib/**/*.test.ts",
      "tests/deckHub/**/*.test.ts",
      "tests/eval/**/*.test.ts",
      "tests/export/**/*.test.ts",
      "tests/scripts/**/*.test.ts",
      "tests/shell/**/*.test.ts",
      "tests/src/**/*.test.ts",
      ...NODE_ONLY_WORKER_TESTS,
    ],
  },
});
