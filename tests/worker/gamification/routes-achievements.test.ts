import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getAchievementCompletions,
  getXpLedger,
  resetTestDb,
  seedCard,
  seedDeck,
  seedReviewLog,
  seedSchedule,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { traitsForAchievement } from "../../../worker/gamification/traits";
import type { Rarity } from "../../../worker/gamification/constants";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const NOW = "2026-01-05T12:00:00.000Z"; // ISO week 2026-W02 (Mon Jan 5)

async function seedAuthedUser(
  env: Bindings,
  opts?: { id?: string; email?: string; session?: string },
) {
  const id = opts?.id ?? "user-routes";
  const email = opts?.email ?? "routes@example.com";
  const session = opts?.session ?? "sess-routes";
  await seedUser(env, {
    id,
    email,
    password_hash: null,
    oauth_subject: null,
    created_at: NOW,
  });
  await seedSession(env, session, id);
  return { id, email, session };
}

const cookie = (session: string) => ({
  cookie: `${SESSION_COOKIE}=${session}`,
  "content-type": "application/json",
});

type AchievementItem = {
  def: {
    id: string;
    category: string;
    fruitType: string;
    rarity: string;
    title: string;
    description: string;
    sortOrder: number;
  };
  progress:
    | { kind: "count"; currentValue: number; threshold: number }
    | {
        kind: "composite";
        parts: { key: string; current: number; target: number }[];
      }
    | null;
  completedAt: string | null;
  traits: { shine: string; colour: string; status: string };
};

type GamificationBody = {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
  streakFreezes: number;
  streakDayMet: boolean;
  dailyGoalReviews: number;
  dailyGoalProgress: number;
  dailyGoalMet: boolean;
  xpToday: number;
  xpTotal: number;
  level: number;
  displayName: string | null;
  boardOptIn: boolean;
};

describe("gamification read APIs", () => {
  it("GET /api/achievements returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/achievements", {}, env);
    expect(res.status).toBe(401);
  });

  it("GET /api/achievements reports both plum conditions", async () => {
    const env = cfEnv;
    const { session } = await seedAuthedUser(env);
    const res = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    const body = (await res.json()) as { items: AchievementItem[] };
    const plum = body.items.find((i) => i.def.id === "plum_scholar");
    expect(plum!.progress).toEqual({
      kind: "composite",
      parts: [
        { key: "streak_best", current: 0, target: 60 },
        { key: "reviews", current: 0, target: 2000 },
      ],
    });
  });

  it("GET /api/achievements lists the full 55-medal catalog", async () => {
    const env = cfEnv;
    const { session } = await seedAuthedUser(env);
    const res = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    const body = (await res.json()) as { items: AchievementItem[] };
    expect(body.items).toHaveLength(55);
    const rarity = (id: string) =>
      body.items.find((i) => i.def.id === id)?.def.rarity;
    expect(rarity("types_2")).toBe("common");
    expect(rarity("clear_due_1")).toBe("common");
  });

  it("GET /api/achievements returns items with derived traits", async () => {
    const env = cfEnv;
    const { session } = await seedAuthedUser(env);

    const res = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: AchievementItem[] };
    expect(body.items.length).toBeGreaterThanOrEqual(12);

    const first = body.items.find((i) => i.def.id === "reviews_1");
    expect(first).toBeDefined();
    expect(first!.def).toMatchObject({
      id: "reviews_1",
      category: "reviews",
      fruitType: "apple",
      rarity: "common",
      title: "First bite",
    });
    expect(first!.completedAt).toBeNull();
    expect(first!.progress).toEqual({
      kind: "count",
      currentValue: 0,
      threshold: 1,
    });
    expect(first!.traits).toEqual(
      traitsForAchievement("reviews_1", first!.def.rarity as Rarity),
    );

    for (const item of body.items) {
      expect(item.traits).toEqual(
        traitsForAchievement(item.def.id, item.def.rarity as Rarity),
      );
    }
  });

  it("GET /api/achievements silently backfills historical unlocks once", async () => {
    const env = cfEnv;
    const { id: userId, session } = await seedAuthedUser(env, {
      id: "user-backfill",
      email: "backfill@example.com",
      session: "sess-backfill",
    });

    await seedDeck(env, {
      id: "deck-bf",
      user_id: userId,
      title: "BF",
      subject_hint: null,
      created_at: NOW,
    });
    await seedCard(env, {
      id: "card-bf",
      deck_id: "deck-bf",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: NOW,
      updated_at: NOW,
    });
    await seedSchedule(env, {
      card_id: "card-bf",
      due: "2026-02-01T00:00:00.000Z",
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

    for (let i = 0; i < 50; i++) {
      const day = String(1 + (i % 28)).padStart(2, "0");
      await seedReviewLog(env, {
        id: `rl-bf-${i}`,
        card_id: "card-bf",
        rating: 3,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: `2025-12-${day}T12:00:00.000Z`,
        state_json: "{}",
      });
    }

    const first = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    expect(first.status).toBe(200);
    const body = (await first.json()) as { items: AchievementItem[] };
    const reviews25 = body.items.find((i) => i.def.id === "reviews_25");
    expect(reviews25?.completedAt).toBeTruthy();

    const completions = (await getAchievementCompletions(env))
      .filter((c) => c.user_id === userId && c.achievement_id === "reviews_25");
    expect(completions).toHaveLength(1);
    expect(completions[0]!.backdated).toBe(1);

    // Backdated completions must not stamp unlock XP into "now" (weekly board).
    expect(
      (await getXpLedger(env))
        .filter(
          (e) =>
            e.user_id === userId && e.idempotency_key === "unlock:reviews_25",
        ),
    ).toHaveLength(0);

    const markerKeys = (await getXpLedger(env))
      .filter(
        (e) =>
          e.user_id === userId && e.idempotency_key === `backfill:v1:${userId}`,
      );
    expect(markerKeys).toHaveLength(1);
    expect(markerKeys[0]!.amount).toBe(0);

    const ledgerBefore = (await getXpLedger(env))
      .filter((e) => e.user_id === userId).length;
    const completionCountBefore = (await getAchievementCompletions(env))
      .filter((c) => c.user_id === userId).length;

    const second = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    expect(second.status).toBe(200);

    expect((await getXpLedger(env)).filter((e) => e.user_id === userId).length).toBe(
      ledgerBefore,
    );
    expect(
      (await getAchievementCompletions(env)).filter((c) => c.user_id === userId)
        .length,
    ).toBe(completionCountBefore);
  });

  it("GET /api/achievements backfill does not unlock clear_due for empty users", async () => {
    const env = cfEnv;
    const { id: userId, session } = await seedAuthedUser(env, {
      id: "user-empty-bf",
      email: "empty-bf@example.com",
      session: "sess-empty-bf",
    });

    const res = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    expect(res.status).toBe(200);

    expect(
      (await getAchievementCompletions(env))
        .filter(
          (c) => c.user_id === userId && c.achievement_id === "clear_due_1",
        ),
    ).toHaveLength(0);
    expect(
      (await getXpLedger(env))
        .filter(
          (e) =>
            e.user_id === userId && e.idempotency_key === "unlock:clear_due_1",
        ),
    ).toHaveLength(0);
  });

  it("GET /api/achievements backfill decays expired streak but unlocks from best", async () => {
    const env = cfEnv;
    const { id: userId, session } = await seedAuthedUser(env, {
      id: "user-streak-bf",
      email: "streak-bf@example.com",
      session: "sess-streak-bf",
    });

    await seedDeck(env, {
      id: "deck-st",
      user_id: userId,
      title: "ST",
      subject_hint: null,
      created_at: NOW,
    });
    await seedCard(env, {
      id: "card-st",
      deck_id: "deck-st",
      job_id: null,
      type: "qa",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: NOW,
      updated_at: NOW,
    });
    await seedSchedule(env, {
      card_id: "card-st",
      due: "2026-02-01T00:00:00.000Z",
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

    for (let i = 0; i < 14; i++) {
      const day = String(i + 1).padStart(2, "0");
      await seedReviewLog(env, {
        id: `rl-st-${i}`,
        card_id: "card-st",
        rating: 3,
        scheduled_days: 1,
        elapsed_days: 0,
        reviewed_at: `2025-01-${day}T12:00:00.000Z`,
        state_json: "{}",
      });
    }

    const res = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: AchievementItem[] };
    expect(
      body.items.find((i) => i.def.id === "streak_7")?.completedAt,
    ).toBeTruthy();
    expect(
      (await getAchievementCompletions(env))
        .find((c) => c.user_id === userId && c.achievement_id === "streak_7")
        ?.backdated,
    ).toBe(1);

    const g = await app.request(
      "/api/gamification",
      { headers: cookie(session) },
      env,
    );
    expect(g.status).toBe(200);
    const gam = (await g.json()) as GamificationBody;
    expect(gam.streakCurrent).toBe(0);
    expect(gam.streakBest).toBe(14);
    expect(gam.streakDay).toBe("2025-01-14");
  });
});
