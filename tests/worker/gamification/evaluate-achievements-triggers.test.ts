import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getAchievementCompletions,
  getProgressWrites,
  getSchedules,
  getUserGamification,
  getXpLedger,
  installProgressWriteRecorder,
  resetTestDb,
  seedAchievementDef,
  seedCard,
  seedDeck,
  seedReviewLog,
  seedSchedule,
  seedUser,
  seedUserGamification,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import {
  evaluateAfterAccept,
  evaluateAfterReview,
} from "../../../worker/gamification/evaluate";
import { onReviewGraded } from "../../../worker/gamification/onStudyEvent";
import {
  creditXp,
  ensureUserGamification,
} from "../../../worker/gamification/xp";
import {
  ACHIEVEMENT_DEF_SEEDS,
  type AchievementDefSeed,
} from "../gamification-seeds";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const NOW = "2026-10-29T12:00:00.000Z";

const LATEST_VERSION = Math.max(
  ...ACHIEVEMENT_DEF_SEEDS.map((d) => d.catalog_version),
);

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
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    await seedReview(env, "rl1", "c1");
    const args = { reviewLogId: "rl1", reviewedAt: new Date(NOW) };

    await evaluateAfterReview(env.DB, "u1", args);
    expect(getProgressWrites()).toContain("reviews_1");

    const afterFirst = getProgressWrites().length;
    await evaluateAfterReview(env.DB, "u1", args);
    expect(getProgressWrites().slice(afterFirst)).toEqual([]);

    await seedReview(env, "rl2", "c1");
    const afterSecond = getProgressWrites().length;
    await evaluateAfterReview(env.DB, "u1", {
      reviewLogId: "rl2",
      reviewedAt: new Date(NOW),
    });
    const writes = getProgressWrites().slice(afterSecond);
    expect(writes).toContain("reviews_25");
    expect(writes).not.toContain("reviews_1");
  });
});

describe("clear-due day counter", () => {
  it("unlocks clear_due_1 when no due cards remain", async () => {
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
    expect(unlocks.map((u) => u.id)).toContain("clear_due_1");
  });

  it("counts at most one clear-due day per UTC day", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    await seedReview(env, "rl1", "c1");
    await seedReview(env, "rl2", "c1");
    await seedReview(env, "rl3", "c1", { reviewedAt: "2026-10-30T09:00:00.000Z" });

    await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl2",
      reviewedAt: new Date(NOW),
    });
    expect((await getUserGamification(env, "u1"))?.clear_due_days).toBe(1);

    await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl3",
      reviewedAt: new Date("2026-10-30T09:00:00.000Z"),
    });
    expect((await getUserGamification(env, "u1"))?.clear_due_days).toBe(2);
  });

  it("does not count a day while an accepted card is past due", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: "2026-10-28T00:00:00.000Z" });
    await seedReview(env, "rl1", "c1");

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect((await getUserGamification(env, "u1"))?.clear_due_days).toBe(0);
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
      arrange: async (env: Bindings) =>
        await seedReview(env, "rl-long", "c1", { elapsedDays: 30 }),
    },
    {
      kind: "mature_cards",
      threshold: 1,
      event: "review" as const,
      arrange: async (env: Bindings) =>
        await seedSchedule(env, {
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
      arrange: async (env: Bindings) =>
        creditXp(env.DB, "u1", 100, "test", "test:level"),
    },
  ])("unlocks a $kind def from a minimal fixture", async (c) => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    await seedAchievementDef(env, testDef(`t_${c.kind}`, c.kind, c.threshold));
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
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    await seedReview(env, "rl1", "c1");
    await ensureUserGamification(env.DB, "u1");
    expect((await getUserGamification(env, "u1"))?.catalog_version).toBe(LATEST_VERSION);
    const next = LATEST_VERSION + 1;
    await seedAchievementDef(env, testDef("t_history", "reviews_total", 1, next));
    await seedAchievementDef(env, testDef("t_next", "reviews_total", 2, next));

    const first = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(first.map((u) => u.id)).toContain("reviews_1");
    expect(first.map((u) => u.id)).not.toContain("t_history");
    const history = (await getAchievementCompletions(env))
      .find((c) => c.achievement_id === "t_history");
    expect(history?.backdated).toBe(1);
    expect(
      (await getXpLedger(env)).some((e) => e.idempotency_key === "unlock:t_history"),
    ).toBe(false);
    expect((await getUserGamification(env, "u1"))?.catalog_version).toBe(next);

    await seedReview(env, "rl2", "c1");
    const second = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl2",
      reviewedAt: new Date(NOW),
    });
    expect(second.map((u) => u.id)).toContain("t_next");
  });

  it("creates a brand-new user at the latest version, so nothing is backdated", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedAchievementDef(env, testDef("t_v2", "reviews_total", 1, LATEST_VERSION));
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    await seedReview(env, "rl1", "c1");
    expect(await getUserGamification(env, "u1")).toBeUndefined();

    const unlocks = await onReviewGraded(env.DB, "u1", {
      reviewLogId: "rl1",
      reviewedAt: new Date(NOW),
    });
    expect(unlocks.map((u) => u.id)).toEqual(
      expect.arrayContaining(["reviews_1", "t_v2"]),
    );
    expect((await getUserGamification(env, "u1"))?.catalog_version).toBe(LATEST_VERSION);
    expect(
      (await getAchievementCompletions(env)).filter((c) => c.backdated === 1),
    ).toEqual([]);
  });

  it("backdates real v2 medals for a v1 user on their next review", async () => {
    const env = installProgressWriteRecorder(cfEnv);
    await seedStudyUser(env);
    await seedAcceptedCard(env, { id: "c1", due: FUTURE });
    await seedAcceptedCard(env, { id: "c2", due: FUTURE });
    await seedSchedule(env, {
      ...(await getSchedules(env)).find((s) => s.card_id === "c2")!,
      scheduled_days: 21,
    });
    await seedReview(env, "rl0", "c1", { reviewedAt: "2026-10-28T12:00:00.000Z" });
    await seedReview(env, "rl1", "c2", { elapsedDays: 30 });
    await ensureUserGamification(env.DB, "u1");
    await seedUserGamification(env, {
      ...(await getUserGamification(env, "u1"))!,
      catalog_version: 1,
    });

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
      const completion = (await getAchievementCompletions(env))
        .find((c) => c.achievement_id === id);
      expect(completion?.backdated, id).toBe(1);
      expect(
        (await getXpLedger(env)).some((e) => e.idempotency_key === `unlock:${id}`),
        id,
      ).toBe(false);
    }
    expect((await getUserGamification(env, "u1"))?.catalog_version).toBe(LATEST_VERSION);
  });
});
