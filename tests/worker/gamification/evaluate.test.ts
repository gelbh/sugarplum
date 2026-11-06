import { describe, it, expect } from "vitest";
import { createTestEnv } from "../test-env";
import {
  compositeParts,
  evaluateAfterAccept,
  evaluateAfterReview,
} from "../../../worker/gamification/evaluate";
import { onReviewGraded, onCardAccepted } from "../../../worker/gamification/onStudyEvent";
import { traitsForAchievement } from "../../../worker/gamification/traits";
import { XP } from "../../../worker/gamification/constants";
import {
  creditXp,
  ensureUserGamification,
} from "../../../worker/gamification/xp";
import {
  ACHIEVEMENT_DEF_SEEDS,
  type AchievementDefSeed,
} from "../gamification-seeds";

const NOW = "2026-10-29T12:00:00.000Z";
const LATEST_VERSION = Math.max(
  ...ACHIEVEMENT_DEF_SEEDS.map((d) => d.catalog_version),
);

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

  it("concurrent reviews never push review XP past the daily cap", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    for (let i = 0; i < 19; i++) {
      await creditXp(env.DB, "u1", XP.perReview, "review", `review:pre${i}`);
    }
    const at = new Date();
    await Promise.all(
      ["rlA", "rlB"].map((id) =>
        onReviewGraded(env.DB, "u1", { reviewLogId: id, reviewedAt: at }),
      ),
    );
    const reviewXp = env
      .getXpLedger()
      .filter((e) => e.idempotency_key.startsWith("review:"))
      .reduce((sum, e) => sum + e.amount, 0);
    expect(reviewXp).toBe(XP.reviewDailyCap);
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

  it("falls back to zero targets when params_json is JSON null", () => {
    expect(compositeParts("null", { streakBest: 3, reviewsTotal: 7 })).toEqual([
      { key: "streak_best", current: 3, target: 0 },
      { key: "reviews", current: 7, target: 0 },
    ]);
  });
});

const FUTURE = "2026-11-01T00:00:00.000Z";

function seedReview(
  env: ReturnType<typeof createTestEnv>,
  id: string,
  cardId: string,
  opts: { reviewedAt?: string; elapsedDays?: number } = {},
) {
  env.seedReviewLog({
    id,
    card_id: cardId,
    rating: 3,
    scheduled_days: 1,
    elapsed_days: opts.elapsedDays ?? 0,
    reviewed_at: opts.reviewedAt ?? NOW,
    state_json: "{}",
  });
}

function testDef(
  id: string,
  triggerKind: string,
  threshold: number,
  catalogVersion = 1,
): AchievementDefSeed {
  return {
    id,
    category: "test",
    fruit_type: "apple",
    rarity: "common",
    trigger_kind: triggerKind,
    threshold,
    params_json: null,
    title: id,
    description: id,
    sort_order: 9999,
    active: 1,
    catalog_version: catalogVersion,
  };
}

describe("evaluateAchievements write discipline", () => {
  it("skips completed defs and writes only changed progress", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: FUTURE });
    seedReview(env, "rl1", "c1");
    const args = { reviewLogId: "rl1", reviewedAt: new Date(NOW) };

    await evaluateAfterReview(env.DB, "u1", args);
    expect(env.getProgressWrites()).toContain("reviews_1");

    const afterFirst = env.getProgressWrites().length;
    await evaluateAfterReview(env.DB, "u1", args);
    expect(env.getProgressWrites().slice(afterFirst)).toEqual([]);

    seedReview(env, "rl2", "c1");
    const afterSecond = env.getProgressWrites().length;
    await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: "rl2",
      reviewedAt: new Date(NOW),
    });
    const writes = env.getProgressWrites().slice(afterSecond);
    expect(writes).toContain("reviews_25");
    expect(writes).not.toContain("reviews_1");
  });
});

describe("clear-due day counter", () => {
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

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).toContain("clear_due_1");
  });

  it("counts at most one clear-due day per UTC day", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: FUTURE });
    seedReview(env, "rl1", "c1");
    seedReview(env, "rl2", "c1");
    seedReview(env, "rl3", "c1", { reviewedAt: "2026-10-30T09:00:00.000Z" });

    await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl2",
      reviewedAt: new Date(NOW),
    });
    expect(env.getUserGamification("u1")?.clear_due_days).toBe(1);

    await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl3",
      reviewedAt: new Date("2026-10-30T09:00:00.000Z"),
    });
    expect(env.getUserGamification("u1")?.clear_due_days).toBe(2);
  });

  it("does not count a day while an accepted card is past due", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: "2026-10-28T00:00:00.000Z" });
    seedReview(env, "rl1", "c1");

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(env.getUserGamification("u1")?.clear_due_days).toBe(0);
    expect(unlocks.map((u) => u.id)).not.toContain("clear_due_1");
  });
});

describe("new trigger kinds", () => {
  it.each([
    {
      kind: "library_decks",
      threshold: 1,
      event: "accept" as const,
      arrange: () => {},
    },
    {
      kind: "long_reviews",
      threshold: 1,
      event: "review" as const,
      arrange: (env: ReturnType<typeof createTestEnv>) =>
        seedReview(env, "rl-long", "c1", { elapsedDays: 30 }),
    },
    {
      kind: "mature_cards",
      threshold: 1,
      event: "review" as const,
      arrange: (env: ReturnType<typeof createTestEnv>) =>
        env.seedSchedule({
          card_id: "c1",
          due: FUTURE,
          stability: 30,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 21,
          learning_steps: 0,
          reps: 5,
          lapses: 0,
          state: 2,
          last_review: NOW,
        }),
    },
    {
      kind: "level_reached",
      threshold: 2,
      event: "review" as const,
      arrange: (env: ReturnType<typeof createTestEnv>) =>
        creditXp(env.DB, "u1", 100, "test", "test:level"),
    },
  ])("unlocks a $kind def from a minimal fixture", async (c) => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: FUTURE });
    env.seedAchievementDef(testDef(`t_${c.kind}`, c.kind, c.threshold));
    await c.arrange(env);

    const { unlocks } =
      c.event === "accept"
        ? await evaluateAfterAccept(env.DB, "u1", {
            cardId: "c1",
            cardType: "qa",
          })
        : await evaluateAfterReview(env.DB, "u1", {
            reviewLogId: "rl-x",
            reviewedAt: new Date(NOW),
          });
    expect(unlocks.map((u) => u.id)).toContain(`t_${c.kind}`);
  });
});

describe("catalog versions", () => {
  it("backdates defs newer than the user's version, keeps shipped defs live", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: FUTURE });
    seedReview(env, "rl1", "c1");
    await ensureUserGamification(env.DB, "u1");
    expect(env.getUserGamification("u1")?.catalog_version).toBe(LATEST_VERSION);
    const next = LATEST_VERSION + 1;
    env.seedAchievementDef(testDef("t_history", "reviews_total", 1, next));
    env.seedAchievementDef(testDef("t_next", "reviews_total", 2, next));

    const first = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(first.map((u) => u.id)).toContain("reviews_1");
    expect(first.map((u) => u.id)).not.toContain("t_history");
    const history = env
      .getAchievementCompletions()
      .find((c) => c.achievement_id === "t_history");
    expect(history?.backdated).toBe(1);
    expect(
      env.getXpLedger().some((e) => e.idempotency_key === "unlock:t_history"),
    ).toBe(false);
    expect(env.getUserGamification("u1")?.catalog_version).toBe(next);

    seedReview(env, "rl2", "c1");
    const second = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl2",
      reviewedAt: new Date(NOW),
    });
    expect(second.map((u) => u.id)).toContain("t_next");
  });

  it("creates a brand-new user at the latest version, so nothing is backdated", async () => {
    const env = createTestEnv();
    env.seedAchievementDef(testDef("t_v2", "reviews_total", 1, LATEST_VERSION));
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: FUTURE });
    seedReview(env, "rl1", "c1");
    expect(env.getUserGamification("u1")).toBeUndefined();

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).toEqual(
      expect.arrayContaining(["reviews_1", "t_v2"]),
    );
    expect(env.getUserGamification("u1")?.catalog_version).toBe(LATEST_VERSION);
    expect(
      env.getAchievementCompletions().filter((c) => c.backdated === 1),
    ).toEqual([]);
  });

  it("backdates real v2 medals for a v1 user on their next review", async () => {
    const env = createTestEnv();
    seedStudyUser(env);
    seedAcceptedCard(env, { id: "c1", due: FUTURE });
    seedAcceptedCard(env, { id: "c2", due: FUTURE });
    env.seedSchedule({
      ...env.getSchedules().find((s) => s.card_id === "c2")!,
      scheduled_days: 21,
    });
    seedReview(env, "rl0", "c1", { reviewedAt: "2026-10-28T12:00:00.000Z" });
    seedReview(env, "rl1", "c2", { elapsedDays: 30 });
    await ensureUserGamification(env.DB, "u1");
    env.getUserGamification("u1")!.catalog_version = 1;

    const v2 = ["study_days_2", "long_reviews_1", "mature_1"];
    for (const id of v2) {
      expect(
        ACHIEVEMENT_DEF_SEEDS.find((d) => d.id === id)?.catalog_version,
      ).toBe(2);
    }

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).toContain("reviews_1");
    for (const id of v2) {
      expect(unlocks.map((u) => u.id)).not.toContain(id);
      const completion = env
        .getAchievementCompletions()
        .find((c) => c.achievement_id === id);
      expect(completion?.backdated, id).toBe(1);
      expect(
        env.getXpLedger().some((e) => e.idempotency_key === `unlock:${id}`),
        id,
      ).toBe(false);
    }
    expect(env.getUserGamification("u1")?.catalog_version).toBe(LATEST_VERSION);
  });
});
