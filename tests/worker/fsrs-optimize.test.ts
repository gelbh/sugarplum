import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";
import {
  isOptimizeDue,
  markOptimizePendingBatch,
  saveFsrsWeights,
} from "../../worker/study/fsrsOptimize";
import { getDb } from "../../worker/db/client";

const fixtureW = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.01);

describe("isOptimizeDue", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("requires at least 400 reviews", () => {
    expect(isOptimizeDue(399, null, now)).toBe(false);
    expect(isOptimizeDue(400, null, now)).toBe(true);
  });

  it("is not due within 30 days of last optimize", () => {
    expect(
      isOptimizeDue(500, "2026-05-20T00:00:00.000Z", now),
    ).toBe(false);
  });

  it("is due when last optimize is older than 30 days", () => {
    expect(
      isOptimizeDue(500, "2026-04-01T00:00:00.000Z", now),
    ).toBe(true);
  });
});

describe("FSRS optimize API", () => {
  function seedUser(env: ReturnType<typeof createTestEnv>) {
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-a",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
    });
  }

  function authHeaders(extra?: Record<string, string>) {
    return {
      cookie: `${SESSION_COOKIE}=sess-a`,
      origin: "http://localhost",
      ...extra,
    };
  }

  it("budget PUT leaves fsrs_w_json intact", async () => {
    const env = createTestEnv();
    seedUser(env);
    env.seedUserStudyPrefs({
      user_id: "user-a",
      intro_budget: 20,
      review_budget: 200,
      r_floor: 0.8,
      desired_retention: 0.9,
      enable_fuzz: 1,
      fsrs_w_json: JSON.stringify(fixtureW),
      fsrs_last_optimized_at: "2026-01-01T00:00:00.000Z",
      fsrs_optimize_pending: 0,
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: {
          ...authHeaders({ "content-type": "application/json" }),
        },
        body: JSON.stringify({
          introBudget: 15,
          reviewBudget: 150,
          rFloor: 0.8,
          desiredRetention: 0.9,
          enableFuzz: true,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);

    const statusRes = await app.request(
      "/api/settings/study/fsrs-optimize",
      { headers: authHeaders() },
      env,
    );
    expect(statusRes.status).toBe(200);
    expect(await statusRes.json()).toMatchObject({ hasCustomW: true });
  });

  it("PUT weights rejects invalid vectors and accepts 21 finites", async () => {
    const env = createTestEnv();
    seedUser(env);

    const bad = await app.request(
      "/api/settings/study/fsrs-weights",
      {
        method: "PUT",
        headers: {
          ...authHeaders({ "content-type": "application/json" }),
        },
        body: JSON.stringify({ w: [1, 2, 3] }),
      },
      env,
    );
    expect(bad.status).toBe(400);

    const good = await app.request(
      "/api/settings/study/fsrs-weights",
      {
        method: "PUT",
        headers: {
          ...authHeaders({ "content-type": "application/json" }),
        },
        body: JSON.stringify({ w: fixtureW }),
      },
      env,
    );
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ ok: true, wLength: 21 });

    const statusRes = await app.request(
      "/api/settings/study/fsrs-optimize",
      { headers: authHeaders() },
      env,
    );
    const status = (await statusRes.json()) as {
      hasCustomW: boolean;
      pending: boolean;
    };
    expect(status.hasCustomW).toBe(true);
    expect(status.pending).toBe(false);
  });

  it("export returns only the authed user's rows", async () => {
    const env = createTestEnv();
    seedUser(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-b",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedReviewLog({
      id: "rl-a",
      card_id: "card-a",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-02-01T00:00:00.000Z",
      state_json: JSON.stringify({ state: 1 }),
    });
    env.seedReviewLog({
      id: "rl-b",
      card_id: "card-b",
      rating: 2,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-02-01T00:00:00.000Z",
      state_json: JSON.stringify({ state: 2 }),
    });

    const res = await app.request(
      "/api/settings/study/fsrs-revlog.csv",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("card_id,review_time,review_rating,review_duration,review_state");
    expect(text).toContain("card-a");
    expect(text).not.toContain("card-b");
  });

  it("markOptimizePendingBatch marks due users and skips fresh ones", async () => {
    const env = createTestEnv();
    seedUser(env);
    for (let i = 0; i < 400; i++) {
      env.seedReviewLog({
        id: `rl-${i}`,
        card_id: "card-a",
        rating: 3,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        state_json: JSON.stringify({ state: 1 }),
      });
    }
    env.seedUserStudyPrefs({
      user_id: "user-a",
      intro_budget: 20,
      review_budget: 200,
      r_floor: 0.8,
      desired_retention: 0.9,
      enable_fuzz: 1,
      fsrs_w_json: null,
      fsrs_last_optimized_at: null,
      fsrs_optimize_pending: 0,
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const db = getDb(env);
    const marked = await markOptimizePendingBatch(
      db,
      new Date("2026-06-01T00:00:00.000Z"),
      50,
    );
    expect(marked).toBe(1);

    const statusRes = await app.request(
      "/api/settings/study/fsrs-optimize",
      { headers: authHeaders() },
      env,
    );
    expect(await statusRes.json()).toMatchObject({ pending: true });

    // Fresh optimize: clear pending, stamp last, should not re-mark.
    await saveFsrsWeights(db, "user-a", fixtureW, new Date("2026-06-01T00:00:00.000Z"));
    const markedAgain = await markOptimizePendingBatch(
      db,
      new Date("2026-06-02T00:00:00.000Z"),
      50,
    );
    expect(markedAgain).toBe(0);
  });
});
