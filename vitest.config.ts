import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

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
      // Node-only worker tests (host fs / node:sqlite); excluded from worker project
      "tests/worker/atlas/backfill-field-overrides-sqlite.test.ts",
      "tests/worker/atlas/dataset.test.ts",
      "tests/worker/atlas/fixtures.test.ts",
      "tests/worker/atlas/focus-override-sqlite.test.ts",
      "tests/worker/atlas/migration.test.ts",
      "tests/worker/d1-reads-hygiene.test.ts",
      "tests/worker/gamification/schema.test.ts",
      "tests/worker/patch-sqljs-plugin.test.ts",
      "tests/worker/pdf-ocr-study-buffer.test.ts",
      "tests/worker/quota-sql.test.ts",
      "tests/worker/unique-violation.test.ts",
      "tests/worker/view-as-route-annotations.test.ts",
    ],
  },
});
