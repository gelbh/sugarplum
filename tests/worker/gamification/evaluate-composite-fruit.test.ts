import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getAchievementCompletions,
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
  compositeParts,
  evaluateAfterReview,
} from "../../../worker/gamification/evaluate";
import { ACHIEVEMENT_DEF_SEEDS } from "../gamification-seeds";

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

const FUTURE = "2026-11-01T00:00:00.000Z";

async function seedReview(
  env: Bindings,
  id: string,
  cardId: string,
  opts: { reviewedAt?: string; elapsedDays?: number } = {},
) {
  await seedReviewLog(env, {
    id,
    card_id: cardId,
    rating: 3,
    scheduled_days: 1,
    elapsed_days: opts.elapsedDays ?? 0,
    reviewed_at: opts.reviewedAt ?? NOW,
    state_json: "{}",
  });
}

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

describe("harder fruit ladder durability", () => {
  const reviews25Threshold = ACHIEVEMENT_DEF_SEEDS.find(
    (d) => d.id === "reviews_25",
  )!.threshold!;

  it("does not revoke a pre-seeded completion below the current threshold", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    const below = reviews25Threshold - 20;
    for (let i = 0; i < below; i++) await seedReview(env, `rl-keep-${i}`, "c1");
    await env.DB.prepare(
      `INSERT OR IGNORE INTO achievement_completions
         (user_id, achievement_id, completed_at, trigger_event_id, backdated)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("u1", "reviews_25", NOW, "rl-keep-0", 0)
      .run();

    await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: `rl-keep-${below - 1}`,
      reviewedAt: new Date(NOW),
    });

    expect(
      (await getAchievementCompletions(env))
        .some((c) => c.achievement_id === "reviews_25"),
    ).toBe(true);
    expect(
      (await getAchievementCompletions(env))
        .some((c) => c.achievement_id === "reviews_100"),
    ).toBe(false);
  });

  it("requires the live def threshold for incomplete medals", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    const below = reviews25Threshold - 10;
    for (let i = 0; i < below; i++) await seedReview(env, `rl-mid-${i}`, "c1");

    await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: `rl-mid-${below - 1}`,
      reviewedAt: new Date(NOW),
    });

    expect(
      (await getAchievementCompletions(env))
        .some((c) => c.achievement_id === "reviews_25"),
    ).toBe(false);
    const mid = await env.DB.prepare(
      `SELECT achievement_id, current_value, threshold
       FROM achievement_progress WHERE user_id = ?`,
    )
      .bind("u1")
      .all<{
        achievement_id: string;
        current_value: number;
        threshold: number;
      }>();
    const reviews25 = mid.results.find(
      (r) => r.achievement_id === "reviews_25",
    );
    expect(reviews25?.current_value).toBe(below);
    expect(reviews25?.threshold).toBe(reviews25Threshold);

    for (let i = below; i < reviews25Threshold; i++) {
      await seedReview(env, `rl-mid-${i}`, "c1");
    }
    const unlocks = await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: `rl-mid-${reviews25Threshold - 1}`,
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.unlocks.map((u) => u.id)).toContain("reviews_25");
  });
});
