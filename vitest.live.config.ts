import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/eval/live.live.ts"],
    testTimeout: 120000,
  },
});
