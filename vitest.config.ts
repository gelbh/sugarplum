import { defineConfig } from "vitest/config";
import { patchSqlJsForWorkers } from "./worker/export/patchSqlJsPlugin";

export default defineConfig({
  plugins: [patchSqlJsForWorkers()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
