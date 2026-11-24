import { env as cfEnv } from "cloudflare:workers";
import {
  getXpLedger,
  resetTestDb,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { backfillUser } from "../../../worker/gamification/backfill";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("backfillUser", () => {
  it("stays idempotent when two runs overlap", async () => {
    const env = cfEnv;
    await seedUser(env, {
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
    const markers = (await getXpLedger(env))
      .filter((e) => e.idempotency_key === "backfill:v1:u-bf");
    expect(markers).toHaveLength(1);
  });
});
