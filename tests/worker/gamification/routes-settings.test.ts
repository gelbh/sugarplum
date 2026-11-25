import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

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
  it("GET /api/gamification returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/gamification", {}, env);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/gamification/settings returns 401 without session", async () => {
    const env = cfEnv;
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

  it("GET /api/gamification returns defaults after ensure", async () => {
    const env = cfEnv;
    const { session } = await seedAuthedUser(env);

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
      streakFreezes: 0,
      streakDayMet: false,
      dailyGoalReviews: 20,
      dailyGoalProgress: 0,
      dailyGoalMet: false,
      xpToday: 0,
      xpTotal: 0,
      level: 1,
      displayName: null,
      boardOptIn: false,
    });
  });

  it("PATCH /api/gamification/settings clamps dailyGoalReviews", async () => {
    const env = cfEnv;
    const { session } = await seedAuthedUser(env);

    const patch = await app.request(
      "/api/gamification/settings",
      {
        method: "PATCH",
        headers: cookie(session),
        body: JSON.stringify({ dailyGoalReviews: 200 }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as GamificationBody;
    expect(patched.dailyGoalReviews).toBe(100);

    const bad = await app.request(
      "/api/gamification/settings",
      {
        method: "PATCH",
        headers: cookie(session),
        body: JSON.stringify({ dailyGoalReviews: "nope" }),
      },
      env,
    );
    expect(bad.status).toBe(400);
  });

  it("PATCH /api/gamification/settings updates boardOptIn and displayName", async () => {
    const env = cfEnv;
    const { session } = await seedAuthedUser(env);

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
});
