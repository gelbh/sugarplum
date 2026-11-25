import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  vi.useRealTimers();
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

type LeaderboardBody = {
  weekKey: string;
  entries: Array<{
    userId: string;
    displayName: string | null;
    xp: number;
  }>;
};

describe("gamification read APIs", () => {
  it("GET /api/leaderboard/weekly returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/leaderboard/weekly", {}, env);
    expect(res.status).toBe(401);
  });

  it("GET /api/leaderboard/weekly uses ISO week key and opt-in only", async () => {
    const env = cfEnv;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    const a = await seedAuthedUser(env, {
      id: "user-a",
      email: "a@example.com",
      session: "sess-a",
    });
    const b = await seedAuthedUser(env, {
      id: "user-b",
      email: "b@example.com",
      session: "sess-b",
    });
    await seedAuthedUser(env, {
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
      .bind(
        "xl-a1",
        "user-a",
        100,
        "test",
        "test:a1",
        "2026-01-06T10:00:00.000Z",
      )
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "xl-b1",
        "user-b",
        50,
        "test",
        "test:b1",
        "2026-01-07T10:00:00.000Z",
      )
      .run();
    // Opted-out user XP must not appear
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "xl-c1",
        "user-c",
        999,
        "test",
        "test:c1",
        "2026-01-06T10:00:00.000Z",
      )
      .run();
    // Outside week
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "xl-a0",
        "user-a",
        500,
        "test",
        "test:a0",
        "2025-12-29T10:00:00.000Z",
      )
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
    expect(body.weekKey).toBe("2026-W02");
    expect(body.entries.map((e) => [e.userId, e.xp])).toEqual([
      ["user-a", 100],
      ["user-b", 50],
    ]);
    expect(body.entries.every((e) => !("email" in e))).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("@example.com");
    expect(raw).not.toContain("a@example.com");
  });

  it("GET /api/leaderboard/weekly ranks opt-in weekly XP for current ISO week", async () => {
    const env = cfEnv;
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

    const a = await seedAuthedUser(env, {
      id: "lb-a",
      email: "lba@example.com",
      session: "sess-lb-a",
    });
    const b = await seedAuthedUser(env, {
      id: "lb-b",
      email: "lbb@example.com",
      session: "sess-lb-b",
    });
    await seedAuthedUser(env, {
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
