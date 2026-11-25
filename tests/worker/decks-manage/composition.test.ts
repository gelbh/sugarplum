import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
  seedCard,
  seedDeck,
  seedSchedule,
  seedSubject,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("GET /api/decks/:id/composition", () => {
  it("401 when unauthenticated", async () => {
    const env = cfEnv;
    const res = await app.request("/api/decks/deck-1/composition", {}, env);
    expect(res.status).toBe(401);
  });

  it("404 for another user's deck", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      subject_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await app.request(
      "/api/decks/deck-b/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns composition for accepted cards only", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-new",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q"',
      back_json: '"A"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-young",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Qy"',
      back_json: '"Ay"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "c-young",
      due: "2026-01-02T00:00:00.000Z",
      stability: 20,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 20,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: "2026-01-01T12:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-draft",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Qd"',
      back_json: '"Ad"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-1/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      new: 1,
      learning: 0,
      young: 1,
      mature: 0,
      total: 2,
      graduated: 1,
      graduatedPct: 50,
      recallCardCount: 2,
    });
  });
});
