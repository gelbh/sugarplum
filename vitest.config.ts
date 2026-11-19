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
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
