import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedCard,
  seedDeck,
  seedSchedule,
  seedSession,
  seedUser,
} from "./harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("GET /api/study/struggling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/study/struggling", {}, env);
    expect(res.status).toBe(401);
  });

  it("never returns another user’s cards", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Mine",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Theirs",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

    await seedCard(env, {
      id: "mine",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Mine?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "mine",
      due: "2026-10-01T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 3,
      lapses: 2,
      state: 2,
      last_review: "2026-10-20T00:00:00.000Z",
    });

    await seedCard(env, {
      id: "theirs",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Secret?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "theirs",
      due: "2026-10-01T00:00:00.000Z",
      stability: 1,
      difficulty: 9,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 3,
      lapses: 5,
      state: 2,
      last_review: "2026-10-20T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/study/struggling",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((r) => r.id)).toEqual(["mine"]);
    expect(body.some((r) => r.id === "theirs")).toBe(false);
  });
});
