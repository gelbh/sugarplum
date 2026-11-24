import type { D1Migration } from "@cloudflare/vitest-plugin";

declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

export {};
