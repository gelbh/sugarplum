import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getSchedules,
  resetTestDb,
  seedCard,
  seedDeck,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type CardBody = {
  id: string;
  deck_id: string;
  type: string;
  front: string | Record<string, unknown>;
  back: string | { answer: string };
  status: string;
  options?: string[];
  media_r2_keys?: string[];
};

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bones",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...extra,
  };
}

describe("POST /api/cards/:id/reset-schedule", () => {
  it("rewrites schedule from newCard (due ~now, reps/lapses cleared)", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCard(env, {
      id: "card-1",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "card-1",
      due: "2030-01-01T00:00:00.000Z",
      stability: 40,
      difficulty: 7,
      elapsed_days: 10,
      scheduled_days: 30,
      learning_steps: 2,
      reps: 8,
      lapses: 3,
      state: 2,
      last_review: "2026-06-01T00:00:00.000Z",
    });
    const before = Date.now();

    const res = await app.request(
      "/api/cards/card-1/reset-schedule",
      {
        method: "POST",
        headers: authHeaders(),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      id: "card-1",
      status: "accepted",
      type: "qa",
      front: "Q?",
      back: "A",
    });

    const schedule = (await getSchedules(env)).find((s) => s.card_id === "card-1");
    expect(schedule).toBeTruthy();
    expect(schedule!.reps).toBe(0);
    expect(schedule!.lapses).toBe(0);
    expect(schedule!.last_review).toBeNull();
    const dueMs = Date.parse(schedule!.due);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("returns 404 for another user's card", async () => {
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
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "card-b",
      deck_id: "deck-b",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-b/reset-schedule",
      {
        method: "POST",
        headers: authHeaders(),
      },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for a draft card", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCard(env, {
      id: "card-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-draft/reset-schedule",
      {
        method: "POST",
        headers: authHeaders(),
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});
