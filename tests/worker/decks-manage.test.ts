import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

type DeckBody = {
  id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
  created_at: string;
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

async function createSubject(
  env: ReturnType<typeof createTestEnv>,
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
    const env = createTestEnv();
    seedOwner(env);

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
    const env = createTestEnv();
    seedOwner(env);
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

describe("GET /api/decks?subjectId=", () => {
  it("filters decks by subjectId", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "sub-1",
      user_id: "user-a",
      title: "A",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "sub-2",
      user_id: "user-a",
      title: "B",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-1",
      user_id: "user-a",
      title: "In A",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-2",
      user_id: "user-a",
      title: "In B",
      subject_hint: null,
      subject_id: "sub-2",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks?subjectId=sub-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const list = (await res.json()) as DeckBody[];
    expect(list).toEqual([
      {
        id: "deck-1",
        title: "In A",
        subject_hint: null,
        subject_id: "sub-1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("PATCH /api/decks/:id", () => {
  it("renames an owned deck", async () => {
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
      title: "Old",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "New" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as DeckBody;
    expect(body).toMatchObject({
      id: "deck-1",
      title: "New",
      subject_id: "sub-1",
      subject_hint: null,
    });
  });

  it("returns 404 when renaming another user's deck", async () => {
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
      "/api/decks/deck-b",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ title: "Stolen" }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/decks/:id/stats", () => {
  it("returns accepted, draft, and materials counts", async () => {
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
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "c-acc",
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
    env.seedCard({
      id: "c-draft",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q2"',
      back_json: '"A2"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-1",
      kind: "paste",
      r2_key: "materials/deck-1/mat-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-1/stats",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accepted: 1,
      draft: 1,
      materials: 1,
    });
  });
});

describe("DELETE /api/decks/:id", () => {
  it("deletes an owned deck and cascades cards and schedules", async () => {
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
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-1",
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
    env.seedSchedule({
      card_id: "card-1",
      due: "2026-01-02T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-1",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(env.getCards()).toHaveLength(0);
    expect(env.getSchedules()).toHaveLength(0);
    expect(env.getMaterials()).toHaveLength(0);

    const listRes = await app.request(
      "/api/decks",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(await listRes.json()).toEqual([]);
  });

  it("deletes R2 keys for materials and card media before cascading", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-r2",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const materialKey = "materials/deck-r2/mat-1.pdf";
    const mediaKey = "materials/deck-r2/figures/0.png";
    env.seedR2(materialKey, "pdf-bytes");
    env.seedR2(mediaKey, "png-bytes");
    env.seedR2("materials/other-deck/keep.pdf", "keep");
    env.seedMaterial({
      id: "mat-r2",
      deck_id: "deck-r2",
      kind: "pdf",
      r2_key: materialKey,
      filename: "mat-1.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedCard({
      id: "card-r2",
      deck_id: "deck-r2",
      job_id: null,
      type: "image_label",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: JSON.stringify([mediaKey]),
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-r2",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(env.getR2Keys()).toEqual(["materials/other-deck/keep.pdf"]);
    expect(env.getMaterials()).toHaveLength(0);
    expect(env.getCards()).toHaveLength(0);
  });

  it("returns 404 when deleting another user's deck", async () => {
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
      "/api/decks/deck-b",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});
