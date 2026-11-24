import { env as cfEnv } from "cloudflare:workers";
import {
  getUserGamification,
  resetTestDb,
  seedUser,
  seedUserGamification,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import {
  applyStreakExpiry,
  maybeEarnStreakFreeze,
  reconcileStreakWithFreeze,
  wouldExpireStreak,
  utcPreviousDay,
} from "../../../worker/gamification/streak";
import { STREAK_FREEZE } from "../../../worker/gamification/constants";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("streak freeze", () => {
  it("wouldExpireStreak is false for today and yesterday", () => {
    const today = "2026-01-10";
    expect(wouldExpireStreak(today, today)).toBe(false);
    expect(wouldExpireStreak(utcPreviousDay(today), today)).toBe(false);
    expect(wouldExpireStreak("2026-01-08", today)).toBe(true);
  });

  it("applyStreakExpiry still zeros without freeze path", () => {
    const expired = applyStreakExpiry(
      { streakCurrent: 5, streakBest: 9, streakDay: "2026-01-01" },
      "2026-01-10",
    );
    expect(expired.streakCurrent).toBe(0);
    expect(expired.streakBest).toBe(9);
  });

  it("reconcile consumes one freeze for a single missed day", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-freeze",
      email: "f@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    // Today 01-10; yesterday 01-09; last study 01-08 → one missed day.
    await seedUserGamification(env, {
      user_id: "u-freeze",
      streak_current: 7,
      streak_best: 7,
      streak_day: "2026-01-08",
      xp_total: 0,
      level: 1,
      display_name: null,
      board_opt_in: 0,
      updated_at: "2026-01-08T12:00:00.000Z",
      clear_due_days: 0,
      clear_due_last_day: null,
      catalog_version: 1,
      streak_freezes: 1,
      daily_goal_reviews: 20,
      daily_goal_day: null,
    });

    const result = await reconcileStreakWithFreeze(
      env.DB,
      "u-freeze",
      "2026-01-10",
    );
    expect(result.consumedFreeze).toBe(true);
    expect(result.consumedCount).toBe(1);
    const row = await getUserGamification(env, "u-freeze");
    expect(row?.streak_current).toBe(7);
    expect(row?.streak_day).toBe("2026-01-09");
    expect(row?.streak_freezes).toBe(0);
  });

  it("reconcile zeros when freezes cannot cover a multi-day gap", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-gap",
      email: "gap@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUserGamification(env, {
      user_id: "u-gap",
      streak_current: 7,
      streak_best: 7,
      streak_day: "2026-01-07",
      xp_total: 0,
      level: 1,
      display_name: null,
      board_opt_in: 0,
      updated_at: "2026-01-07T12:00:00.000Z",
      clear_due_days: 0,
      clear_due_last_day: null,
      catalog_version: 1,
      streak_freezes: 1,
      daily_goal_reviews: 20,
      daily_goal_day: null,
    });

    const result = await reconcileStreakWithFreeze(
      env.DB,
      "u-gap",
      "2026-01-10",
    );
    expect(result.consumedFreeze).toBe(false);
    expect((await getUserGamification(env, "u-gap"))?.streak_current).toBe(0);
    expect((await getUserGamification(env, "u-gap"))?.streak_freezes).toBe(1);
  });

  it("reconcile zeros streak when no freezes", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-gone",
      email: "g@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUserGamification(env, {
      user_id: "u-gone",
      streak_current: 4,
      streak_best: 4,
      streak_day: "2026-01-07",
      xp_total: 0,
      level: 1,
      display_name: null,
      board_opt_in: 0,
      updated_at: "2026-01-07T12:00:00.000Z",
      clear_due_days: 0,
      clear_due_last_day: null,
      catalog_version: 1,
      streak_freezes: 0,
      daily_goal_reviews: 20,
      daily_goal_day: null,
    });

    const result = await reconcileStreakWithFreeze(
      env.DB,
      "u-gone",
      "2026-01-10",
    );
    expect(result.consumedFreeze).toBe(false);
    expect((await getUserGamification(env, "u-gone"))?.streak_current).toBe(0);
  });

  it("maybeEarnStreakFreeze awards at multiples up to cap", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-earn",
      email: "e@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUserGamification(env, {
      user_id: "u-earn",
      streak_current: 6,
      streak_best: 6,
      streak_day: "2026-01-06",
      xp_total: 0,
      level: 1,
      display_name: null,
      board_opt_in: 0,
      updated_at: "2026-01-06T12:00:00.000Z",
      clear_due_days: 0,
      clear_due_last_day: null,
      catalog_version: 1,
      streak_freezes: 0,
      daily_goal_reviews: 20,
      daily_goal_day: null,
    });

    const earned = await maybeEarnStreakFreeze(env.DB, "u-earn", 6, 7);
    expect(earned.earned).toBe(true);
    expect((await getUserGamification(env, "u-earn"))?.streak_freezes).toBe(1);

    await seedUserGamification(env, {
      ...(await getUserGamification(env, "u-earn"))!,
      streak_freezes: STREAK_FREEZE.maxStored,
    });
    const capped = await maybeEarnStreakFreeze(env.DB, "u-earn", 13, 14);
    expect(capped.earned).toBe(false);
    expect((await getUserGamification(env, "u-earn"))?.streak_freezes).toBe(
      STREAK_FREEZE.maxStored,
    );
  });
});
