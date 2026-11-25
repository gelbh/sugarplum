/**
 * Worker tests that must run on the Node Vitest project (host fs / node:sqlite).
 * Included by vitest.config.ts; excluded by vitest.worker.config.ts.
 */
export const NODE_ONLY_WORKER_TESTS = [
  "tests/worker/atlas/backfill-field-overrides-sqlite.test.ts",
  "tests/worker/atlas/corrections-sqlite.test.ts",
  "tests/worker/atlas/dataset-built-in-parasite.test.ts",
  "tests/worker/atlas/dataset-schema.test.ts",
  "tests/worker/atlas/dataset-vocabulary.test.ts",
  "tests/worker/atlas/fixtures.test.ts",
  "tests/worker/atlas/focus-override-sqlite.test.ts",
  "tests/worker/atlas/migration-ownership.test.ts",
  "tests/worker/atlas/migration-dataset.test.ts",
  "tests/worker/atlas/migration-focus.test.ts",
  "tests/worker/atlas/migration-fingerprint.test.ts",
  "tests/worker/atlas/migration-materials.test.ts",
  "tests/worker/atlas/migration-notes.test.ts",
  "tests/worker/atlas/migration-focus-in-pack.test.ts",
  "tests/worker/atlas/migration-overrides.test.ts",
  "tests/worker/d1-reads-hygiene.test.ts",
  "tests/worker/gamification/schema.test.ts",
  "tests/worker/materials-source-role-migration.test.ts",
  "tests/worker/node-only-globs-drift.test.ts",
  "tests/worker/patch-sqljs-plugin.test.ts",
  "tests/worker/pdf-ocr-study-buffer.test.ts",
  "tests/worker/quota-sql.test.ts",
  "tests/worker/unique-violation.test.ts",
  "tests/worker/view-as-route-annotations.test.ts",
  "tests/worker/wrangler-queue-sync.test.ts",
  "tests/worker/gamification-def-seeds-drift.test.ts",
] as const;
