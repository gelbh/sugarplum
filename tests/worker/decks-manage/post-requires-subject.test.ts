import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
  seedSubject,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type DeckBody = {
  id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
  created_at: string;
};

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

async function createSubject(
  env: Bindings,
  title = "Anatomy",
): Promise<string> {
  const res = await app.request(
    "/api/subjects",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=sess-a`,
      },
      body: JSON.stringify({ title }),
    },
    env,
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe("POST /api/decks requires subjectId", () => {
  it("returns 400 when subjectId is missing", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/decks",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "Bones" }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when subjectId is not owned by the user", async () => {
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

    const res = await app.request(
      "/api/decks",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "Bones", subjectId: "sub-b" }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("creates a deck under an owned subject and returns subject_id", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const subjectId = await createSubject(env);

    const res = await app.request(
      "/api/decks",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "Bones", subjectId }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as DeckBody;
    expect(body.id).toBeTruthy();
    expect(body.title).toBe("Bones");
    expect(body.subject_id).toBe(subjectId);
    expect(body.subject_hint).toBeNull();
    expect(body.created_at).toBeTruthy();
  });
});
