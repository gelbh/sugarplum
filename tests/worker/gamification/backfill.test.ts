import { describe, expect, it } from "vitest";
import { backfillUser } from "../../../worker/gamification/backfill";
import { createTestEnv } from "../test-env";

describe("backfillUser", () => {
  it("stays idempotent when two runs overlap", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u-bf",
      email: "bf@test.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-10-30T00:00:00.000Z",
    });
    await Promise.all([
      backfillUser(env.DB, "u-bf"),
      backfillUser(env.DB, "u-bf"),
    ]);
    const markers = env
      .getXpLedger()
      .filter((e) => e.idempotency_key === "backfill:v1:u-bf");
    expect(markers).toHaveLength(1);
  });
});
