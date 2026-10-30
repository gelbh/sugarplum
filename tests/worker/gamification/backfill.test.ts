import { describe, expect, it } from "vitest";
import { backfillUser } from "../../../worker/gamification/backfill";
import { createTestEnv } from "../test-env";

describe("backfillUser", () => {
  it("shares one run between concurrent calls for a user", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u-bf",
      email: "bf@test.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-10-30T00:00:00.000Z",
    });
    const first = backfillUser(env.DB, "u-bf");
    const second = backfillUser(env.DB, "u-bf");
    expect(second).toBe(first);
    await first;
    const later = backfillUser(env.DB, "u-bf");
    expect(later).not.toBe(first);
    await later;
    const markers = env
      .getXpLedger()
      .filter((e) => e.idempotency_key === "backfill:v1:u-bf");
    expect(markers).toHaveLength(1);
  });
});
