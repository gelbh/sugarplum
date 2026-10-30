import { describe, it, expect } from "vitest";
import { createTestEnv } from "../test-env";
import {
  compositeParts,
  evaluateAfterAccept,
  evaluateAfterReview,
} from "../../../worker/gamification/evaluate";
import { onReviewGraded, onCardAccepted } from "../../../worker/gamification/onStudyEvent";
import { traitsForAchievement } from "../../../worker/gamification/traits";

const NOW = "2026-10-29T12:00:00.000Z";

function seedStudyUser(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "u1",
    email: "u1@test.com",
    password_hash: null,
    oauth_subject: null,
    created_at: NOW,
  });
  env.seedDeck({
    id: "d1",
    user_id: "u1",
    title: "Deck",
    subject_hint: null,
    created_at: NOW,
  });
}

function seedAcceptedCard(
  env: ReturnType<typeof createTestEnv>,
  opts: { id: string; type?: string; due: string },
) {
  env.seedCard({
    id: opts.id,
    deck_id: "d1",
    job_id: null,
    type: opts.type ?? "qa",
    front_json: "{}",
    back_json: "{}",
    media_r2_keys_json: null,
    provenance_json: null,
    status: "accepted",
    created_at: NOW,
    updated_at: NOW,
  });
  env.seedSchedule({
    card_id: opts.id,
    due: opts.due,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    last_review: NOW,
  });
}

describe("evaluateAfterReview", () => {
  it("unlocks reviews_1 on first review and is idempotent", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    env.seedReviewLog({
      id: "rl1",
      card_id: "c1",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: NOW,
      state_json: "{}",
    });

    const db = env.DB;
    const args = { reviewLogId: "rl1", reviewedAt: new Date(NOW) };

    const first = await evaluateAfterReview(db, "u1", args);
    expect(first.unlocks).toContainEqual({
      id: "reviews_1",
      title: "First bite",
      fruitType: "apple",
      rarity: "common",
      traits: traitsForAchievement("reviews_1", "common"),
    });

    const second = await evaluateAfterReview(db, "u1", args);
    expect(second.unlocks).toEqual([]);

    const completions = env
      .getAchievementCompletions()
      .filter((c) => c.achievement_id === "reviews_1");
    expect(completions).toHaveLength(1);

    const unlockXp = env
      .getXpLedger()
      .filter((e) => e.idempotency_key === "unlock:reviews_1");
    expect(unlockXp).toHaveLength(1);
  });

  it("unlocks clear_due_1 when no due cards remain", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    env.seedReviewLog({
      id: "rl1",
      card_id: "c1",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: NOW,
      state_json: "{}",
    });

    const { unlocks } = await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).toContain("clear_due_1");
  });

  it("does not unlock plum_scholar after a single review", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    env.seedReviewLog({
      id: "rl1",
      card_id: "c1",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: NOW,
      state_json: "{}",
    });

    const { unlocks } = await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).not.toContain("plum_scholar");
  });
});

describe("evaluateAfterAccept", () => {
  it("unlocks accepts_1 on first accept", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });

    const { unlocks } = await evaluateAfterAccept(env.DB, "u1", {
      cardId: "c1",
      cardType: "qa",
    });
    expect(unlocks.map((u) => u.id)).toContain("accepts_1");
  });
});

describe("onStudyEvent facade", () => {
  it("onReviewGraded awards review XP and returns unlocks", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    env.seedReviewLog({
      id: "rl1",
      card_id: "c1",
      rating: 3,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: NOW,
      state_json: "{}",
    });

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).toContain("reviews_1");

    const keys = new Set(env.getXpLedger().map((e) => e.idempotency_key));
    expect(keys.has("review_day:2026-10-29")).toBe(true);
    expect(keys.has("review:rl1")).toBe(true);
  });

  it("onCardAccepted awards accept XP once", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });

    await onCardAccepted(env.DB, "u1", { cardId: "c1", cardType: "qa" });
    await onCardAccepted(env.DB, "u1", { cardId: "c1", cardType: "qa" });

    const acceptXp = env
      .getXpLedger()
      .filter((e) => e.idempotency_key === "accept:c1");
    expect(acceptXp).toHaveLength(1);
  });
});

describe("compositeParts", () => {
  it("reports each plum condition against its target", () => {
    expect(
      compositeParts('{"streak_best_min":30,"reviews_min":200}', {
        streakBest: 12,
        reviewsTotal: 250,
      }),
    ).toEqual([
      { key: "streak_best", current: 12, target: 30 },
      { key: "reviews", current: 250, target: 200 },
    ]);
  });
});
