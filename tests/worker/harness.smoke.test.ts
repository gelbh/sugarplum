import { afterEach, describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import {
  clearQueueMessages,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedSession,
  seedUser,
} from "./harness";

afterEach(async () => {
  clearQueueMessages();
  await resetTestDb(env);
});

describe("harness smoke", () => {
  it("inserts a user readable via D1", async () => {
    await seedUser(env, {
      id: "u-smoke",
      email: "smoke@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: new Date().toISOString(),
    });
    const row = await env.DB.prepare("SELECT email FROM users WHERE id = ?")
      .bind("u-smoke")
      .first<{ email: string }>();
    expect(row?.email).toBe("smoke@example.com");
  });

  it("seeds a session into SESSIONS KV", async () => {
    await seedSession(env, "sess-smoke", "u-smoke");
    const raw = await env.SESSIONS.get("sess-smoke");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).userId).toBe("u-smoke");
  });

  it("record-only queues capture sends without a real binding", async () => {
    const recorded = installQueueRecorders(
      { ...env, GENERATE_QUEUE: undefined },
      { forward: false },
    );
    await recorded.GENERATE_QUEUE!.send({ jobId: "j-smoke" });
    expect(getQueueMessages()).toEqual([{ jobId: "j-smoke" }]);
  });
});
