import { describe, it, expect } from "vitest";
import {
  afterReviewMaybeCompleteDailyGoal,
  getDailyGoalProgress,
} from "../../../worker/gamification/dailyGoal";
import { XP } from "../../../worker/gamification/constants";
import { createTestEnv } from "../test-env";

const DAY = "2026-01-10";

function seedReviewer(env: ReturnType<typeof createTestEnv>, reviews: number) {
  env.seedUser({
    id: "u-goal",
    email: "goal@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-goal",
    user_id: "u-goal",
    title: "Goal",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedUserGamification({
    user_id: "u-goal",
    streak_current: 1,
    streak_best: 1,
    streak_day: DAY,
    xp_total: 0,
    level: 1,
    display_name: null,
    board_opt_in: 0,
    updated_at: `${DAY}T12:00:00.000Z`,
    clear_due_days: 0,
    clear_due_last_day: null,
    catalog_version: 1,
    streak_freezes: 0,
    daily_goal_reviews: 5,
    daily_goal_day: null,
  });
  for (let i = 0; i < reviews; i++) {
    const cardId = `card-goal-${i}`;
    env.seedCard({
      id: cardId,
      deck_id: "deck-goal",
      job_id: null,
      type: "qa",
      front_json: '"q"',
      back_json: '"a"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: `${DAY}T00:00:00.000Z`,
      updated_at: `${DAY}T00:00:00.000Z`,
    });
    env.seedReviewLog({
      id: `rl-goal-${i}`,
      card_id: cardId,
      rating: 3,
      scheduled_days: 0,
      elapsed_days: 0,
      reviewed_at: `${DAY}T12:0${i}:00.000Z`,
      state_json: "{}",
    });
  }
}

describe("daily goal", () => {
  it("does not award below the goal", async () => {
    const env = createTestEnv();
    seedReviewer(env, 1);
    const progress = await getDailyGoalProgress(env.DB, "u-goal", DAY);
    expect(progress.current).toBe(1);
    expect(progress.goal).toBe(5);
    expect(progress.met).toBe(false);

    const result = await afterReviewMaybeCompleteDailyGoal(
      env.DB,
      "u-goal",
      DAY,
    );
    expect(result.awarded).toBe(false);
    expect(env.getXpLedger().filter((r) => r.reason === "daily_goal")).toHaveLength(
      0,
    );
  });

  it("awards once at the goal and is idempotent", async () => {
    const env = createTestEnv();
    seedReviewer(env, 5);

    const first = await afterReviewMaybeCompleteDailyGoal(
      env.DB,
      "u-goal",
      DAY,
    );
    expect(first.awarded).toBe(true);
    const ledger = env.getXpLedger().filter((r) => r.reason === "daily_goal");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.amount).toBe(XP.dailyGoalComplete);
    expect(env.getUserGamification("u-goal")?.daily_goal_day).toBe(DAY);

    const second = await afterReviewMaybeCompleteDailyGoal(
      env.DB,
      "u-goal",
      DAY,
    );
    expect(second.awarded).toBe(false);
    expect(env.getXpLedger().filter((r) => r.reason === "daily_goal")).toHaveLength(
      1,
    );
  });

  it("first review leaves goal incomplete when N > 1", async () => {
    const env = createTestEnv();
    seedReviewer(env, 1);
    const progress = await getDailyGoalProgress(env.DB, "u-goal", DAY);
    expect(progress.met).toBe(false);
    expect(progress.current).toBe(1);
    // Streak day can already be met independently of the goal.
    expect(env.getUserGamification("u-goal")?.streak_day).toBe(DAY);
  });
});
