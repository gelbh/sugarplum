import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedCard,
  seedDeck,
  seedReviewLog,
  seedSchedule,
  seedSession,
  seedUser,
} from "./harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import type { InsightsSummary } from "../../src/insights/types";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


describe("GET /api/insights/summary", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/insights/summary", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns zero-filled series for empty user", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

    const res = await app.request(
      "/api/insights/summary?tzOffsetMinutes=0",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as InsightsSummary;
    expect(body.reviewsPerDay).toHaveLength(30);
    expect(body.reviewsPerDay.every((p) => p.count === 0)).toBe(true);
    expect(body.activityByDay).toHaveLength(90);
    expect(body.activityByDay.every((p) => p.count === 0)).toBe(true);
    expect(body.window.activityDays).toBe(90);
    expect(body.gradeCounts).toEqual({
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    });
    expect(body.kpis.composition.total).toBe(0);
    expect(body.futureDue).toHaveLength(14);
    expect(body.futureDue.every((p) => p.count === 0)).toBe(true);
    expect(body.hourlySuccess).toHaveLength(24);
    expect(body.hourlySuccess.every((p) => p.rate === null)).toBe(true);
    expect(body.kpis.dueToday).toBe(0);
    expect(body.kpis.overdue).toBe(0);
    expect(body.kpis.dailyLoad).toBeNull();
    expect(body.kpis.trueRetention.overall.rate).toBeNull();
    expect(body.gradeCountsByMaturity.young).toEqual({
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    });
    expect(body.kpis.subjectDifficultyStability).toEqual([]);
    expect(body.gamification).not.toBeNull();
    expect(body.gamification!.level).toBeGreaterThanOrEqual(1);
  });

  it("aggregates own reviews and excludes other users", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Theirs",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedCard(env, {
      id: "mine",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "theirs",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q2?"),
      back_json: JSON.stringify("A2"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "mine",
      due: "2026-11-13T00:00:00.000Z",
      stability: 10,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 5,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: 2,
      last_review: "2026-11-12T00:00:00.000Z",
    });
    await seedReviewLog(env, {
      id: "rl-1",
      card_id: "mine",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-11-13T08:00:00.000Z",
      state_json: "{}",
    });
    await seedReviewLog(env, {
      id: "rl-2",
      card_id: "mine",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-11-12T08:00:00.000Z",
      state_json: "{}",
    });
    await seedReviewLog(env, {
      id: "rl-other",
      card_id: "theirs",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-11-13T08:00:00.000Z",
      state_json: "{}",
    });

    const res = await app.request(
      "/api/insights/summary?tzOffsetMinutes=0",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as InsightsSummary;
    expect(body.kpis.reviewsInWindow).toBe(2);
    expect(body.kpis.reviewedToday).toBe(1);
    expect(body.gradeCounts.again).toBe(1);
    expect(body.gradeCounts.good).toBe(1);
    expect(body.kpis.composition.total).toBe(1);
    expect(body.kpis.subjectDifficultyStability).toEqual([
      {
        subjectId: null,
        title: "Unassigned",
        difficulty: { easy: 0, medium: 1, hard: 0, total: 1 },
        medianStabilityDays: 10,
      },
    ]);
  });

  it("honors localDay for reviewedToday bucket", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedCard(env, {
      id: "mine",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedReviewLog(env, {
      id: "rl-old",
      card_id: "mine",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-11-12T08:00:00.000Z",
      state_json: "{}",
    });

    const res = await app.request(
      "/api/insights/summary?tzOffsetMinutes=0&localDay=2026-11-12",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as InsightsSummary;
    expect(body.reviewsPerDay[body.reviewsPerDay.length - 1]!.day).toBe(
      "2026-11-12",
    );
    expect(body.kpis.reviewedToday).toBe(1);
  });

  it("scales windows for rangeDays=365", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

    const res = await app.request(
      "/api/insights/summary?tzOffsetMinutes=0&rangeDays=365",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as InsightsSummary;
    expect(body.window).toEqual({
      reviewsDays: 365,
      gradeDays: 170,
      activityDays: 365,
    });
    expect(body.reviewsPerDay).toHaveLength(365);
    expect(body.activityByDay).toHaveLength(365);
    expect(body.kpis.trueRetention.windowDays).toBe(365);
    expect(body.kpis.consistency.windowDays).toBe(365);
    expect(body.futureDue).toHaveLength(14);
  });
});

