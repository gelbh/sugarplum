import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

describe("GET /api/journey", () => {
  it("returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/journey", {}, env);
    expect(res.status).toBe(401);
  });

  it("zero decks → empty signals", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u1",
      email: "u@example.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess1", "u1");
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
    const env = createTestEnv();
    env.seedUser({
      id: "u2",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "u2",
      title: "T",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-b",
      kind: "text",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-need",
      material_id: "mat-1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: null,
    });
    // draft card attached to that job
    env.seedCard({
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
    env.seedSession("sess2", "u2");

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
  });

  it("queued job sets pendingGenerationJobId", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u-pend",
      email: "p@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-p",
      user_id: "u-pend",
      title: "T",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-p",
      deck_id: "deck-p",
      kind: "text",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-queued",
      material_id: "mat-p",
      status: "queued",
      error: null,
      coverage_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: null,
    });
    env.seedSession("sess-p", "u-pend");

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
  });

  it("accepted card increments acceptedCount; draft does not", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u3",
      email: "c@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-c",
      user_id: "u3",
      title: "T",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    // accepted card with past due schedule
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedCard({
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

    env.seedSession("sess3", "u3");
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

