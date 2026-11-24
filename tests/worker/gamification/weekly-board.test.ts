import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
} from "../harness";
import { describe, it, expect, vi, afterEach } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import {
  neighborsAround,
  rankBoardRows,
  type BoardNeighbor,
} from "../../../worker/gamification/weeklyBoard";


afterEach(async () => {
  await resetTestDb(cfEnv);
});

const NOW = "2026-01-07T12:00:00.000Z"; // inside 2026-W02

async function seedAuthedUser(
  env: Bindings,
  opts: { id: string; email: string; session: string },
) {
  await seedUser(env, {
    id: opts.id,
    email: opts.email,
    password_hash: null,
    oauth_subject: null,
    created_at: NOW,
  });
  await seedSession(env, opts.session, opts.id);
  return opts;
}

const cookie = (session: string) => ({
  cookie: `${SESSION_COOKIE}=${session}`,
  "content-type": "application/json",
});

type LeaderboardBody = {
  period: "week" | "all";
  weekKey: string | null;
  entries: Array<{ userId: string; displayName: string | null; xp: number }>;
  me: {
    optedIn: boolean;
    rank: number | null;
    xp: number;
    neighbors: BoardNeighbor[];
    xpLastWeek: number;
  };
};

describe("weeklyBoard helpers", () => {
  it("ranks by xp then user_id and brackets neighbors", () => {
    const ranked = rankBoardRows([
      { user_id: "c", display_name: "C", xp: 100 },
      { user_id: "a", display_name: "A", xp: 300 },
      { user_id: "b", display_name: "B", xp: 200 },
      { user_id: "z", display_name: "Z", xp: 0 },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["a", "b", "c"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);

    const mid = neighborsAround(ranked, "b", 1);
    expect(mid.rank).toBe(2);
    expect(mid.neighbors.map((n) => n.userId)).toEqual(["a", "b", "c"]);
  });
});

describe("GET /api/leaderboard/weekly me payload", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns rank and neighbors for mid-pack opted-in viewer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    const env = cfEnv;
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
    const c = await seedAuthedUser(env, {
      id: "user-c",
      email: "c@example.com",
      session: "sess-c",
    });
    await seedAuthedUser(env, {
      id: "user-d",
      email: "d@example.com",
      session: "sess-d",
    });

    for (const { session, displayName } of [
      { session: a.session, displayName: "Alpha" },
      { session: b.session, displayName: "Beta" },
      { session: c.session, displayName: "Gamma" },
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

    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-a", "user-a", 300, "test", "test:a", "2026-01-06T10:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-b", "user-b", 200, "test", "test:b", "2026-01-06T11:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-c", "user-c", 100, "test", "test:c", "2026-01-06T12:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-d", "user-d", 999, "test", "test:d", "2026-01-06T12:00:00.000Z")
      .run();

    const res = await app.request(
      "/api/leaderboard/weekly",
      { headers: cookie(b.session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeaderboardBody;
    expect(body.period).toBe("week");
    expect(body.weekKey).toBe("2026-W02");
    expect(body.entries.map((e) => e.userId)).toEqual([
      "user-a",
      "user-b",
      "user-c",
    ]);
    expect(body.entries.length).toBeLessThanOrEqual(50);
    expect(body.me.optedIn).toBe(true);
    expect(body.me.rank).toBe(2);
    expect(body.me.xp).toBe(200);
    expect(body.me.neighbors.map((n) => n.userId)).toEqual([
      "user-a",
      "user-b",
      "user-c",
    ]);
    expect(body.entries.every((e) => e.userId !== "user-d")).toBe(true);
  });

  it("opted-out viewer gets personal xp without public rank", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    const env = cfEnv;
    const a = await seedAuthedUser(env, {
      id: "user-a",
      email: "a@example.com",
      session: "sess-a",
    });
    const d = await seedAuthedUser(env, {
      id: "user-d",
      email: "d@example.com",
      session: "sess-d",
    });

    await app.request(
      "/api/gamification/settings",
      {
        method: "PATCH",
        headers: cookie(a.session),
        body: JSON.stringify({ boardOptIn: true, displayName: "Alpha" }),
      },
      env,
    );

    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-a", "user-a", 50, "test", "test:a", "2026-01-06T10:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("xl-d", "user-d", 400, "test", "test:d", "2026-01-06T10:00:00.000Z")
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_gamification (
         user_id, streak_current, streak_best, streak_day,
         xp_total, level, display_name, board_opt_in, updated_at
       ) VALUES (?, 0, 0, NULL, 0, 1, NULL, 0, ?)`,
    )
      .bind("user-d", NOW)
      .run();

    const res = await app.request(
      "/api/leaderboard/weekly",
      { headers: cookie(d.session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeaderboardBody;
    expect(body.me.optedIn).toBe(false);
    expect(body.me.rank).toBeNull();
    expect(body.me.xp).toBe(400);
    expect(body.me.neighbors).toEqual([]);
    expect(body.entries.every((e) => e.userId !== "user-d")).toBe(true);
  });

  it("GET /api/leaderboard/all-time ranks by xp_total", async () => {
    const env = cfEnv;
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

    await env.DB.prepare(
      `UPDATE user_gamification SET xp_total = xp_total + ?, updated_at = ? WHERE user_id = ?`,
    )
      .bind(500, NOW, "user-a")
      .run();
    await env.DB.prepare(
      `UPDATE user_gamification SET xp_total = xp_total + ?, updated_at = ? WHERE user_id = ?`,
    )
      .bind(200, NOW, "user-b")
      .run();

    const res = await app.request(
      "/api/leaderboard/all-time",
      { headers: cookie(b.session) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeaderboardBody;
    expect(body.period).toBe("all");
    expect(body.weekKey).toBeNull();
    expect(body.entries.map((e) => e.userId)).toEqual(["user-a", "user-b"]);
    expect(body.me.rank).toBe(2);
    expect(body.me.xp).toBe(200);
    expect(body.me.xpLastWeek).toBe(0);
  });
});
