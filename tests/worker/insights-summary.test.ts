import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";
import type { InsightsSummary } from "../../src/insights/types";

describe("GET /api/insights/summary", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/insights/summary", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns zero-filled series for empty user", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

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
    expect(body.gamification).not.toBeNull();
    expect(body.gamification!.level).toBeGreaterThanOrEqual(1);
  });

  it("aggregates own reviews and excludes other users", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Theirs",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedCard({
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
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedReviewLog({
      id: "rl-1",
      card_id: "mine",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-11-13T08:00:00.000Z",
      state_json: "{}",
    });
    env.seedReviewLog({
      id: "rl-2",
      card_id: "mine",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: "2026-11-12T08:00:00.000Z",
      state_json: "{}",
    });
    env.seedReviewLog({
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
  });

  it("honors localDay for reviewedToday bucket", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedCard({
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
    env.seedReviewLog({
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
});

