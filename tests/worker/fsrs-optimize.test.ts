import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedReviewLog,
  seedSession,
  seedUser,
  seedUserStudyPrefs,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  isOptimizeDue,
  markOptimizePendingBatch,
  saveFsrsWeights,
} from "../../worker/study/fsrsOptimize";
import { getDb } from "../../worker/db/client";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


const fixtureW = Array.from({ length: 34 }, (_, i) => 0.1 + i * 0.01);

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
  async function seedUserFixture(env: Bindings) {
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
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
    const env = cfEnv;
    await seedUserFixture(env);
    await seedUserStudyPrefs(env, {
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

  it("reset clears custom w but keeps Run-now eligible with enough reviews", async () => {
    const env = cfEnv;
    await seedUserFixture(env);
    for (let i = 0; i < 400; i++) {
      await seedReviewLog(env, {
        id: `rl-reset-${i}`,
        card_id: "card-a",
        rating: 3,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        state_json: JSON.stringify({ state: 1 }),
      });
    }
    await seedUserStudyPrefs(env, {
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

    const resetRes = await app.request(
      "/api/settings/study/fsrs-weights/reset",
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(resetRes.status).toBe(200);

    const statusRes = await app.request(
      "/api/settings/study/fsrs-optimize",
      { headers: authHeaders() },
      env,
    );
    expect(await statusRes.json()).toMatchObject({
      hasCustomW: false,
      eligible: true,
      pending: false,
    });
  });

  it("PUT weights rejects invalid vectors and accepts 34 finites", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

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
    expect(JSON.stringify(await bad.json())).toContain("Invalid FSRS weights");

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
    expect(await good.json()).toMatchObject({
      ok: true,
      wLength: 34,
      rescheduled: { cardsUpdated: 0, cardsSkipped: 0 },
    });

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
    const env = cfEnv;
    await seedUserFixture(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
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
    await seedReviewLog(env, {
      id: "rl-a",
      card_id: "card-a",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-02-01T00:00:00.000Z",
      state_json: JSON.stringify({ state: 1 }),
    });
    await seedReviewLog(env, {
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
    const env = cfEnv;
    await seedUserFixture(env);
    for (let i = 0; i < 400; i++) {
      await seedReviewLog(env, {
        id: `rl-${i}`,
        card_id: "card-a",
        rating: 3,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        state_json: JSON.stringify({ state: 1 }),
      });
    }
    await seedUserStudyPrefs(env, {
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

    await saveFsrsWeights(db, "user-a", fixtureW, new Date("2026-06-01T00:00:00.000Z"));
    const markedAgain = await markOptimizePendingBatch(
      db,
      new Date("2026-06-02T00:00:00.000Z"),
      50,
    );
    expect(markedAgain).toBe(0);
  });
});
