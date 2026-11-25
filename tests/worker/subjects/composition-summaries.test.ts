import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { describe, it, expect, afterEach } from "vitest";
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

describe("GET /api/subjects/composition-summaries", () => {
  it("401 when unauthenticated", async () => {
    const env = cfEnv;
    const res = await app.request(
      "/api/subjects/composition-summaries",
      {},
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns owner summaries only with graduated pct", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-empty",
      user_id: "user-a",
      title: "Empty",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-other",
      user_id: "user-b",
      title: "Other",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_id: "sub-1",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-other",
      user_id: "user-b",
      title: "Stolen",
      subject_id: "sub-other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-new",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("New?"),
      back_json: JSON.stringify("A"),
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
      front_json: JSON.stringify("Young?"),
      back_json: JSON.stringify("A"),
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
      id: "c-other",
      deck_id: "deck-other",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Other?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/composition-summaries",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      subjectId: string;
      total: number;
      graduatedPct: number | null;
      new: number;
      learning: number;
      young: number;
      mature: number;
      avgRetrievability: number | null;
      etk: number;
      recallCardCount: number;
    }>;
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      subjectId: "sub-empty",
      total: 0,
      graduatedPct: null,
      new: 0,
      learning: 0,
      young: 0,
      mature: 0,
      avgRetrievability: null,
      etk: 0,
      recallCardCount: 0,
    });
    expect(body[1]).toMatchObject({
      subjectId: "sub-1",
      total: 2,
      graduatedPct: 50,
      new: 1,
      learning: 0,
      young: 1,
      mature: 0,
      recallCardCount: 2,
    });
    expect(body[1]!.avgRetrievability).not.toBeNull();
    expect(body[1]!.etk).toBeGreaterThan(0);
    for (const row of body) {
      expect(row).toHaveProperty("avgRetrievability");
      expect(row).toHaveProperty("etk");
      expect(row).toHaveProperty("recallCardCount");
    }
  });
});
