import { describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { traitsForAchievement } from "../../../worker/gamification/traits";
import type { Rarity } from "../../../worker/gamification/constants";
import { createTestEnv } from "../test-env";

const NOW = "2026-01-05T12:00:00.000Z"; // ISO week 2026-W02 (Mon Jan 5)

function seedAuthedUser(
  env: ReturnType<typeof createTestEnv>,
  opts?: { id?: string; email?: string; session?: string },
) {
  const id = opts?.id ?? "user-routes";
  const email = opts?.email ?? "routes@example.com";
  const session = opts?.session ?? "sess-routes";
  env.seedUser({
    id,
    email,
    password_hash: null,
    oauth_subject: null,
    created_at: NOW,
  });
  env.seedSession(session, id);
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
  progress: { currentValue: number; threshold: number } | null;
  completedAt: string | null;
  traits: { shine: string; colour: string; status: string };
};

type GamificationBody = {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
  xpTotal: number;
  level: number;
  displayName: string | null;
  boardOptIn: boolean;
};

type LeaderboardBody = {
  weekKey: string;
  entries: Array<{
    userId: string;
    displayName: string | null;
    xp: number;
  }>;
};

describe("gamification read APIs", () => {
  it("GET /api/achievements returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/achievements", {}, env);
    expect(res.status).toBe(401);
  });

  it("GET /api/gamification returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/gamification", {}, env);
    expect(res.status).toBe(401);
  });

  it("GET /api/leaderboard/weekly returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/leaderboard/weekly", {}, env);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/gamification/settings returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request(
      "/api/gamification/settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardOptIn: true }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/achievements returns items with derived traits", async () => {
    const env = createTestEnv();
    const { session } = seedAuthedUser(env);

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
    const env = createTestEnv();
    const { id: userId, session } = seedAuthedUser(env, {
      id: "user-backfill",
      email: "backfill@example.com",
      session: "sess-backfill",
    });

    env.seedDeck({
      id: "deck-bf",
      user_id: userId,
      title: "BF",
      subject_hint: null,
      created_at: NOW,
    });
    env.seedCard({
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
    env.seedSchedule({
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

    for (let i = 0; i < 25; i++) {
      const day = String(1 + (i % 28)).padStart(2, "0");
      env.seedReviewLog({
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

    const completions = env
      .getAchievementCompletions()
      .filter((c) => c.user_id === userId && c.achievement_id === "reviews_25");
    expect(completions).toHaveLength(1);
    expect(completions[0]!.backdated).toBe(1);

    // Backdated completions must not stamp unlock XP into "now" (weekly board).
    expect(
      env
        .getXpLedger()
        .filter(
          (e) =>
            e.user_id === userId && e.idempotency_key === "unlock:reviews_25",
        ),
    ).toHaveLength(0);

    const markerKeys = env
      .getXpLedger()
      .filter(
        (e) =>
          e.user_id === userId && e.idempotency_key === `backfill:v1:${userId}`,
      );
    expect(markerKeys).toHaveLength(1);
    expect(markerKeys[0]!.amount).toBe(0);

    const ledgerBefore = env.getXpLedger().filter((e) => e.user_id === userId)
      .length;
    const completionCountBefore = env
      .getAchievementCompletions()
      .filter((c) => c.user_id === userId).length;

    const second = await app.request(
      "/api/achievements",
      { headers: cookie(session) },
      env,
    );
    expect(second.status).toBe(200);

    expect(
      env.getXpLedger().filter((e) => e.user_id === userId).length,
    ).toBe(ledgerBefore);
    expect(
      env.getAchievementCompletions().filter((c) => c.user_id === userId)
        .length,
    ).toBe(completionCountBefore);
  });

  it("GET /api/achievements backfill does not unlock clear_due for empty users", async () => {
    const env = createTestEnv();
    const { id: userId, session } = seedAuthedUser(env, {
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
      env
        .getAchievementCompletions()
        .filter(
          (c) => c.user_id === userId && c.achievement_id === "clear_due_1",
        ),
    ).toHaveLength(0);
    expect(
      env
        .getXpLedger()
        .filter(
          (e) =>
            e.user_id === userId && e.idempotency_key === "unlock:clear_due_1",
        ),
    ).toHaveLength(0);
  });

  it("GET /api/achievements backfill decays expired streak but unlocks from best", async () => {
    const env = createTestEnv();
    const { id: userId, session } = seedAuthedUser(env, {
      id: "user-streak-bf",
      email: "streak-bf@example.com",
      session: "sess-streak-bf",
    });

    env.seedDeck({
      id: "deck-st",
      user_id: userId,
      title: "ST",
      subject_hint: null,
      created_at: NOW,
    });
    env.seedCard({
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
    env.seedSchedule({
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

    for (let i = 0; i < 7; i++) {
      const day = String(i + 1).padStart(2, "0");
      env.seedReviewLog({
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
    expect(body.items.find((i) => i.def.id === "streak_7")?.completedAt).toBeTruthy();
    expect(
      env
        .getAchievementCompletions()
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
    expect(gam.streakBest).toBe(7);
    expect(gam.streakDay).toBe("2025-01-07");
  });

  it("GET /api/gamification returns defaults after ensure", async () => {
    const env = createTestEnv();
    const { session } = seedAuthedUser(env);

    const res = await app.request(
      "/api/gamification",
      { headers: cookie(session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as GamificationBody;
    expect(body).toEqual({
      streakCurrent: 0,
      streakBest: 0,
      streakDay: null,
      xpTotal: 0,
      level: 1,
      displayName: null,
      boardOptIn: false,
    });
  });

  it("PATCH /api/gamification/settings updates boardOptIn and displayName", async () => {
    const env = createTestEnv();
    const { session } = seedAuthedUser(env);

    const patch = await app.request(
      "/api/gamification/settings",
      {
        method: "PATCH",
        headers: cookie(session),
        body: JSON.stringify({ boardOptIn: true, displayName: "Plum" }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as GamificationBody;
    expect(patched.boardOptIn).toBe(true);
    expect(patched.displayName).toBe("Plum");

    const get = await app.request(
      "/api/gamification",
      { headers: cookie(session) },
      env,
    );
    expect(get.status).toBe(200);
    const body = (await get.json()) as GamificationBody;
    expect(body.boardOptIn).toBe(true);
    expect(body.displayName).toBe("Plum");
  });

  it("GET /api/leaderboard/weekly uses ISO week key and opt-in only", async () => {
    const env = createTestEnv();
    const a = seedAuthedUser(env, {
      id: "user-a",
      email: "a@example.com",
      session: "sess-a",
    });
    const b = seedAuthedUser(env, {
      id: "user-b",
      email: "b@example.com",
      session: "sess-b",
    });
    seedAuthedUser(env, {
      id: "user-c",
      email: "c@example.com",
      session: "sess-c",
    });

    // Opt in A and B; leave C opted out
    for (const { session, displayName } of [
      { session: a.session, displayName: "Alpha" },
      { session: b.session, displayName: "Beta" },
    ]) {
      const res = await app.request(
        "/api/gamification/settings",
        {
          method: "PATCH",
          headers: cookie(session),
          body: JSON.stringify({ boardOptIn: true, displayName }),
        },
        env,
      );
      expect(res.status).toBe(200);
    }

    // XP inside 2026-W02 (Mon Jan 5 – Sun Jan 11 UTC)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-a1", "user-a", 100, "test", "test:a1", "2026-01-06T10:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-b1", "user-b", 50, "test", "test:b1", "2026-01-07T10:00:00.000Z")
      .run();
    // Opted-out user XP must not appear
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-c1", "user-c", 999, "test", "test:c1", "2026-01-06T10:00:00.000Z")
      .run();
    // Outside week
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-a0", "user-a", 500, "test", "test:a0", "2025-12-29T10:00:00.000Z")
      .run();

    // Ensure gamification rows exist for ledger users (PATCH already did for a/b)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_gamification (
         user_id, streak_current, streak_best, streak_day,
         xp_total, level, display_name, board_opt_in, updated_at
       ) VALUES (?, 0, 0, NULL, 0, 1, NULL, 0, ?)`,
    )
      .bind("user-c", NOW)
      .run();

    const res = await app.request(
      "/api/leaderboard/weekly",
      { headers: cookie(a.session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeaderboardBody;
    expect(body.weekKey).toMatch(/^\d{4}-W\d{2}$/);
    // When "now" is wall clock, week may not be 2026-W02. Assert shape + privacy.
    expect(body.entries.every((e) => !("email" in e))).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("@example.com");
    expect(raw).not.toContain("a@example.com");
  });

  it("GET /api/leaderboard/weekly ranks opt-in weekly XP for current ISO week", async () => {
    const env = createTestEnv();
    // Freeze week by using ledger timestamps relative to real now's ISO week.
    const now = new Date();
    const day = now.getUTCDay() || 7;
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    monday.setUTCDate(monday.getUTCDate() - day + 1);
    const inWeek = new Date(monday);
    inWeek.setUTCHours(12, 0, 0, 0);
    const inWeekIso = inWeek.toISOString();

    const a = seedAuthedUser(env, {
      id: "lb-a",
      email: "lba@example.com",
      session: "sess-lb-a",
    });
    const b = seedAuthedUser(env, {
      id: "lb-b",
      email: "lbb@example.com",
      session: "sess-lb-b",
    });
    seedAuthedUser(env, {
      id: "lb-c",
      email: "lbc@example.com",
      session: "sess-lb-c",
    });

    for (const { session, displayName } of [
      { session: a.session, displayName: "LeaderA" },
      { session: b.session, displayName: "LeaderB" },
    ]) {
      expect(
        (
          await app.request(
            "/api/gamification/settings",
            {
              method: "PATCH",
              headers: cookie(session),
              body: JSON.stringify({ boardOptIn: true, displayName }),
            },
            env,
          )
        ).status,
      ).toBe(200);
    }

    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_gamification (
         user_id, streak_current, streak_best, streak_day,
         xp_total, level, display_name, board_opt_in, updated_at
       ) VALUES (?, 0, 0, NULL, 0, 1, NULL, 0, ?)`,
    )
      .bind("lb-c", inWeekIso)
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-lb-a", "lb-a", 80, "test", "lb:a", inWeekIso)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-lb-b", "lb-b", 120, "test", "lb:b", inWeekIso)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-lb-c", "lb-c", 999, "test", "lb:c", inWeekIso)
      .run();

    const res = await app.request(
      "/api/leaderboard/weekly",
      { headers: cookie(a.session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeaderboardBody;
    expect(body.weekKey).toMatch(/^\d{4}-W\d{2}$/);
    expect(body.entries.map((e) => e.userId)).toEqual(["lb-b", "lb-a"]);
    expect(body.entries[0]).toEqual({
      userId: "lb-b",
      displayName: "LeaderB",
      xp: 120,
    });
    expect(body.entries[1]).toEqual({
      userId: "lb-a",
      displayName: "LeaderA",
      xp: 80,
    });
    expect(body.entries.some((e) => e.userId === "lb-c")).toBe(false);
    expect(JSON.stringify(body)).not.toContain("@example.com");
  });
});
