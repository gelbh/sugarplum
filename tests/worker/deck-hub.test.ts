import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

type CardBody = {
  id: string;
  deck_id: string;
  type: string;
  front: string;
  back: string;
  status: string;
  options?: string[];
};

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSubject({
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Bones",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...extra,
  };
}

describe("GET /api/decks/:id/cards", () => {
  it("lists empty accepted cards for an owned deck", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/cards",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists only accepted cards", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "c-acc",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Accepted Q?"),
      back_json: JSON.stringify("Accepted A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "c-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Draft Q?"),
      back_json: JSON.stringify("Draft A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/cards",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(200);
    const list = (await res.json()) as CardBody[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "c-acc",
      deck_id: "deck-a",
      type: "qa",
      front: "Accepted Q?",
      back: "Accepted A",
      status: "accepted",
    });
  });

  it("returns 404 for another user's deck", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-b/cards",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(404);
  });
});

describe("POST /api/decks/:id/cards", () => {
  it("creates an accepted qa card with a fresh schedule due near now", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const before = Date.now();

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "qa",
          front: "What is the femur?",
          back: "Thigh bone",
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      deck_id: "deck-a",
      type: "qa",
      front: "What is the femur?",
      back: "Thigh bone",
      status: "accepted",
    });
    expect(body.id).toBeTruthy();

    const schedules = env.getSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.card_id).toBe(body.id);
    expect(schedules[0]!.reps).toBe(0);
    expect(schedules[0]!.lapses).toBe(0);
    const dueMs = Date.parse(schedules[0]!.due);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("returns 404 when creating on another user's deck", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-b/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "qa",
          front: "Q?",
          back: "A",
        }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/cards/:id (accepted hub edit)", () => {
  it("patches front on an accepted card without changing schedule", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
      id: "card-acc",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Old Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSchedule({
      card_id: "card-acc",
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

    const res = await app.request(
      "/api/cards/card-acc",
      {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ front: "New Q?" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      id: "card-acc",
      status: "accepted",
      front: "New Q?",
      back: "A",
    });

    const schedule = env.getSchedules().find((s) => s.card_id === "card-acc");
    expect(schedule?.due).toBe("2030-01-01T00:00:00.000Z");
    expect(schedule?.reps).toBe(8);
    expect(schedule?.lapses).toBe(3);
  });
});

describe("POST /api/cards/:id/reset-schedule", () => {
  it("rewrites schedule from newCard (due ~now, reps/lapses cleared)", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
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
    env.seedSchedule({
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

    const schedule = env.getSchedules().find((s) => s.card_id === "card-1");
    expect(schedule).toBeTruthy();
    expect(schedule!.reps).toBe(0);
    expect(schedule!.lapses).toBe(0);
    expect(schedule!.last_review).toBeNull();
    const dueMs = Date.parse(schedule!.due);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("returns 404 for another user's card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
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
    const env = createTestEnv();
    seedOwner(env);
    env.seedCard({
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
