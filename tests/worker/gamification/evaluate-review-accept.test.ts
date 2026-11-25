import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getAchievementCompletions,
  getXpLedger,
  installProgressWriteRecorder,
  resetTestDb,
  seedCard,
  seedDeck,
  seedReviewLog,
  seedSchedule,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import {
  evaluateAfterAccept,
  evaluateAfterReview,
} from "../../../worker/gamification/evaluate";
import {
  onCardAccepted,
  onReviewGraded,
} from "../../../worker/gamification/onStudyEvent";
import { traitsForAchievement } from "../../../worker/gamification/traits";
import { XP } from "../../../worker/gamification/constants";
import { creditXp } from "../../../worker/gamification/xp";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const NOW = "2026-10-29T12:00:00.000Z";

async function seedStudyUser(env: Bindings) {
  await seedUser(env, {
    id: "u1",
    email: "u1@test.com",
    password_hash: null,
    oauth_subject: null,
    created_at: NOW,
  });
  await seedDeck(env, {
    id: "d1",
    user_id: "u1",
    title: "Deck",
    subject_hint: null,
    created_at: NOW,
  });
}

async function seedAcceptedCard(
  env: Bindings,
  opts: { id: string; type?: string; due: string },
) {
  await seedCard(env, {
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
  await seedSchedule(env, {
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
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    await seedReviewLog(env, {
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

    const completions = (await getAchievementCompletions(env))
      .filter((c) => c.achievement_id === "reviews_1");
    expect(completions).toHaveLength(1);

    const unlockXp = (await getXpLedger(env))
      .filter((e) => e.idempotency_key === "unlock:reviews_1");
    expect(unlockXp).toHaveLength(1);
  });

  it("does not unlock plum_scholar after a single review", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    await seedReviewLog(env, {
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
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });

    const { unlocks } = await evaluateAfterAccept(env.DB, "u1", {
      cardId: "c1",
      cardType: "qa",
    });
    expect(unlocks.map((u) => u.id)).toContain("accepts_1");
  });
});

describe("onStudyEvent facade", () => {
  it("onReviewGraded awards review XP and returns unlocks", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });
    await seedReviewLog(env, {
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

    const keys = new Set((await getXpLedger(env)).map((e) => e.idempotency_key));
    expect(keys.has("review_day:2026-10-29")).toBe(true);
    expect(keys.has("review:rl1")).toBe(true);
  });

  it("concurrent reviews never push review XP past the daily cap", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    for (let i = 0; i < 19; i++) {
      await creditXp(env.DB, "u1", XP.perReview, "review", `review:pre${i}`);
    }
    const at = new Date();
    await Promise.all(
      ["rlA", "rlB"].map((id) =>
        onReviewGraded(env.DB, "u1", { reviewLogId: id, reviewedAt: at }),
      ),
    );
    const reviewXp = (await getXpLedger(env))
      .filter((e) => e.idempotency_key.startsWith("review:"))
      .reduce((sum, e) => sum + e.amount, 0);
    expect(reviewXp).toBe(XP.reviewDailyCap);
  });

  it("onCardAccepted awards accept XP once", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: "2026-11-01T00:00:00.000Z" });

    await onCardAccepted(env.DB, "u1", { cardId: "c1", cardType: "qa" });
    await onCardAccepted(env.DB, "u1", { cardId: "c1", cardType: "qa" });

    const acceptXp = (await getXpLedger(env))
      .filter((e) => e.idempotency_key === "accept:c1");
    expect(acceptXp).toHaveLength(1);
  });
});
