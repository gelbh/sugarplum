import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

type SubjectBody = {
  id: string;
  title: string;
  created_at: string;
  deck_count: number;
};

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("subject CRUD", () => {
  it("creates a subject and lists it with deck_count 0", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const createRes = await app.request(
      "/api/subjects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "Anatomy" }),
      },
      env,
    );

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as SubjectBody;
    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Anatomy");
    expect(created.created_at).toBeTruthy();
    expect(created.deck_count).toBe(0);

    const listRes = await app.request(
      "/api/subjects",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as SubjectBody[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      title: "Anatomy",
      deck_count: 0,
    });
  });

  it("renames a subject via PATCH", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "sub-1",
      user_id: "user-a",
      title: "Old title",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "New title" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SubjectBody;
    expect(body).toMatchObject({
      id: "sub-1",
      title: "New title",
      deck_count: 0,
    });
  });

  it("deletes an empty subject with 204", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "sub-empty",
      user_id: "user-a",
      title: "Empty",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-empty",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);

    const listRes = await app.request(
      "/api/subjects",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    const list = (await listRes.json()) as SubjectBody[];
    expect(list).toHaveLength(0);
  });

  it("returns 409 when deleting a subject that still has decks", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "sub-full",
      user_id: "user-a",
      title: "Has decks",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-full",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-full",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; deck_count: number };
    expect(body.deck_count).toBe(1);
    expect(body.error).toBeTruthy();
  });

  it("lists only the current user's subjects", async () => {
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
      id: "sub-a",
      user_id: "user-a",
      title: "Mine",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const list = (await res.json()) as SubjectBody[];
    expect(list).toEqual([
      {
        id: "sub-a",
        title: "Mine",
        created_at: "2026-01-01T00:00:00.000Z",
        deck_count: 0,
      },
    ]);
  });
});

describe("GET /api/subjects/:id/composition", () => {
  function seedAccepted(
    env: ReturnType<typeof createTestEnv>,
    id: string,
    schedule?: { state: number; scheduled_days: number },
  ) {
    env.seedCard({
      id,
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify(`${id}?`),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    if (schedule) {
      env.seedSchedule({
        card_id: id,
        due: "2026-01-02T00:00:00.000Z",
        stability: Math.max(schedule.scheduled_days, 0.1),
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: schedule.scheduled_days,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: schedule.state,
        last_review: "2026-01-01T12:00:00.000Z",
      });
    }
  }

  it("401 when unauthenticated", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/subjects/sub-1/composition", {}, env);
    expect(res.status).toBe(401);
  });

  it("404 for missing subject", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const res = await app.request(
      "/api/subjects/missing/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("404 when another user owns the subject", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-a",
      user_id: "user-a",
      title: "Owner subject",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/subjects/sub-a/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("aggregates accepted schedules across subject decks", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_id: "sub-1",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    seedAccepted(env, "c-new");
    seedAccepted(env, "c-learn", { state: 1, scheduled_days: 0 });
    seedAccepted(env, "c-young", { state: 2, scheduled_days: 20 });
    seedAccepted(env, "c-mature", { state: 2, scheduled_days: 21 });
    env.seedCard({
      id: "c-draft",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Draft?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/subjects/sub-1/composition",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      new: 1,
      learning: 1,
      young: 1,
      mature: 1,
      total: 4,
      graduated: 2,
      graduatedPct: 50,
    });
  });
});

describe("subject ownership", () => {
  it("returns 404 when PATCH targets another user's subject", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-a",
      user_id: "user-a",
      title: "Owner subject",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/subjects/sub-a",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ title: "Stolen rename" }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when DELETE targets another user's subject", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-a",
      user_id: "user-a",
      title: "Owner subject",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/subjects/sub-a",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});
