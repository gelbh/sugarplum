import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        path.join(import.meta.dirname, "migrations"),
      );
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        // Keep R2/KV/D1 local despite wrangler remote flags
        remoteBindings: false,
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            APP_URL: "http://localhost",
            SECRETS_WRAP_KEY: "0123456789abcdef0123456789abcdef",
            R2_ACCOUNT_ID: "test-account",
            R2_BUCKET_NAME: "sugarplum-materials",
            R2_ACCESS_KEY_ID: "test-access-key",
            R2_SECRET_ACCESS_KEY: "test-secret-key",
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
            TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
          },
          // Force local R2 despite wrangler MATERIALS.remote: true
          r2Buckets: { MATERIALS: "sugarplum-materials" },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./tests/worker/apply-migrations.ts"],
    include: ["tests/worker/**/*.test.ts"],
  },
});
