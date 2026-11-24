import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSchedule,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("GET /api/journey", () => {
  it("returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/journey", {}, env);
    expect(res.status).toBe(401);
  });

  it("zero decks → empty signals", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u1",
      email: "u@example.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess1", "u1");
    const res = await app.request(
      "/api/journey",
      { headers: { Cookie: `${SESSION_COOKIE}=sess1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deckCount: 0,
      hasGenerationJob: false,
      openReviewJobId: null,
      pendingGenerationJobId: null,
      acceptedCount: 0,
      dueCount: 0,
    });
  });

  it("needs_review with drafts sets openReviewJobId", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u2",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "u2",
      title: "T",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-b",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-need",
      material_id: "mat-1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: null,
    });
    // draft card attached to that job
    await seedCard(env, {
      id: "card-draft",
      deck_id: "deck-b",
      job_id: "job-need",
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
    await seedSession(env, "sess2", "u2");

    const res = await app.request(
      "/api/journey",
      { headers: { Cookie: `${SESSION_COOKIE}=sess2` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openReviewJobId).toBe("job-need");
    expect(body.hasGenerationJob).toBe(true);
    expect(body.pendingGenerationJobId).toBeNull();

    const genRes = await app.request(
      "/api/journey/generation",
      { headers: { Cookie: `${SESSION_COOKIE}=sess2` } },
      env,
    );
    expect(genRes.status).toBe(200);
    expect(await genRes.json()).toEqual({
      openReviewJobId: "job-need",
      pendingGenerationJobId: null,
    });
  });

  it("queued job sets pendingGenerationJobId", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-pend",
      email: "p@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-p",
      user_id: "u-pend",
      title: "T",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-p",
      deck_id: "deck-p",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-queued",
      material_id: "mat-p",
      status: "queued",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: null,
    });
    await seedSession(env, "sess-p", "u-pend");

    const res = await app.request(
      "/api/journey",
      { headers: { Cookie: `${SESSION_COOKIE}=sess-p` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasGenerationJob).toBe(true);
    expect(body.openReviewJobId).toBeNull();
    expect(body.pendingGenerationJobId).toBe("job-queued");

    const genRes = await app.request(
      "/api/journey/generation",
      { headers: { Cookie: `${SESSION_COOKIE}=sess-p` } },
      env,
    );
    expect(genRes.status).toBe(200);
    expect(await genRes.json()).toEqual({
      openReviewJobId: null,
      pendingGenerationJobId: "job-queued",
    });
  });

  it("accepted card increments acceptedCount; draft does not", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u3",
      email: "c@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-c",
      user_id: "u3",
      title: "T",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    // accepted card with past due schedule
    await seedCard(env, {
      id: "card-acc",
      deck_id: "deck-c",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "card-acc",
      due: "2020-01-01T00:00:00.000Z",
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });

    // a draft card should not count toward accepted/due
    await seedCard(env, {
      id: "card-draft-2",
      deck_id: "deck-c",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q2"),
      back_json: JSON.stringify("A2"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    await seedSession(env, "sess3", "u3");
    const res = await app.request(
      "/api/journey",
      { headers: { Cookie: `${SESSION_COOKIE}=sess3` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.acceptedCount).toBeGreaterThanOrEqual(1);
    expect(body.dueCount).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/journey/generation", () => {
  it("returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/journey/generation", {}, env);
    expect(res.status).toBe(401);
  });

  it("empty user → both nulls with only job id keys", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-gen-empty",
      email: "empty-gen@example.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-gen-empty", "u-gen-empty");
    const res = await app.request(
      "/api/journey/generation",
      { headers: { Cookie: `${SESSION_COOKIE}=sess-gen-empty` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "openReviewJobId",
      "pendingGenerationJobId",
    ]);
    expect(body).toEqual({
      openReviewJobId: null,
      pendingGenerationJobId: null,
    });
  });
});

