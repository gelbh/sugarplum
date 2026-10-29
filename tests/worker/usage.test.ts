import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  recordGenerationUsageEvent,
  recordGenerationUsageEventForJob,
  usageFieldsFromProgress,
} from "../../worker/generation/usage";
import { createTestEnv } from "./test-env";
import { getDb } from "../../worker/db/client";

describe("usageFieldsFromProgress", () => {
  it("parses tokens and path", () => {
    expect(
      usageFieldsFromProgress(
        JSON.stringify({
          tokens_used: 30,
          tokens_prompt: 10,
          tokens_completion: 20,
          path: "free",
          provider: "workers-ai",
        }),
      ),
    ).toEqual({
      path: "free",
      provider: "workers-ai",
      tokens_prompt: 10,
      tokens_completion: 20,
      tokens_total: 30,
    });
  });

  it("sums prompt+completion when tokens_used missing", () => {
    expect(
      usageFieldsFromProgress(
        JSON.stringify({ tokens_prompt: 4, tokens_completion: 6, path: "byo" }),
      ).tokens_total,
    ).toBe(10);
  });

  it("empty on null/corrupt", () => {
    expect(usageFieldsFromProgress(null).tokens_total).toBeNull();
    expect(usageFieldsFromProgress("{").path).toBeNull();
  });
});

describe("recordGenerationUsageEvent", () => {
  it("inserts once per job_id", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    env.seedUser({
      id: "u1",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "g",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const db = getDb(env);
    const progress = JSON.stringify({
      tokens_used: 12,
      path: "free",
    });
    const first = await recordGenerationUsageEvent(db, {
      userId: "u1",
      jobId: "job-1",
      progressJson: progress,
    });
    const second = await recordGenerationUsageEvent(db, {
      userId: "u1",
      jobId: "job-1",
      progressJson: progress,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("recordGenerationUsageEventForJob resolves user via joins", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u1",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "d1",
      user_id: "u1",
      title: "Deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "m1",
      deck_id: "d1",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-2",
      material_id: "m1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({ tokens_used: 5, path: "byo" }),
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-02T01:00:00.000Z",
    });
    await recordGenerationUsageEventForJob(getDb(env), "job-2");
    await recordGenerationUsageEventForJob(getDb(env), "job-2");
    env.seedSession("s1", "u1");
  });
});

describe("GET /api/admin/overview usage", () => {
  it("includes token aggregates from usage_events", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    env.seedUser({
      id: "u-ops",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "g",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "u-learner",
      email: "learner@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedUsageEvent({
      id: "ue1",
      user_id: "u-learner",
      job_id: "j1",
      kind: "generation",
      path: "free",
      provider: null,
      tokens_prompt: 1,
      tokens_completion: 2,
      tokens_total: 100,
      created_at: new Date().toISOString(),
    });
    env.seedSession("s1", "u-ops");
    const res = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      tokensAllTime: 100,
      freeJobs30d: 1,
    });
  });
});
