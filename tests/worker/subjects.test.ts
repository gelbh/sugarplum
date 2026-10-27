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
    // Task 3 will require subjectId on POST /api/decks; seed with subject_id for now.
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
