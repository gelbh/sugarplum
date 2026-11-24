import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getMaterials,
  getR2Keys,
  getSchedules,
  resetTestDb,
  seedCard,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

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

describe("GET /api/decks?subjectId=", () => {
  it("filters decks by subjectId", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "A",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-2",
      user_id: "user-a",
      title: "B",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "In A",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
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
  it("returns accepted, draft, archived, and materials counts", async () => {
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
    await seedCard(env, {
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
    await seedCard(env, {
      id: "c-arch",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q3"',
      back_json: '"A3"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "archived",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
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
      archived: 1,
      materials: 1,
    });
  });
});

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

describe("DELETE /api/decks/:id", () => {
  it("deletes an owned deck and cascades cards and schedules", async () => {
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
    await seedSchedule(env, {
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
    await seedMaterial(env, {
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
    expect((await getCards(env))).toHaveLength(0);
    expect((await getSchedules(env))).toHaveLength(0);
    expect((await getMaterials(env))).toHaveLength(0);

    const listRes = await app.request(
      "/api/decks",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(await listRes.json()).toEqual([]);
  });

  it("deletes R2 keys for materials and card media before cascading", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-r2",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const materialKey = "materials/deck-r2/mat-1.pdf";
    const mediaKey = "materials/deck-r2/figures/0.png";
    await seedR2(env, materialKey, "pdf-bytes");
    await seedR2(env, mediaKey, "png-bytes");
    await seedR2(env, "materials/other-deck/keep.pdf", "keep");
    await seedMaterial(env, {
      id: "mat-r2",
      deck_id: "deck-r2",
      kind: "pdf",
      r2_key: materialKey,
      filename: "mat-1.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
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
    expect((await getR2Keys(env))).toEqual(["materials/other-deck/keep.pdf"]);
    expect((await getMaterials(env))).toHaveLength(0);
    expect((await getCards(env))).toHaveLength(0);
  });

  it("deletes R2-only figure crops under figures/{pdfId}/ with no materials row", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-fig",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const materialKey = "materials/deck-fig/mat-pdf.pdf";
    const figureKey = "materials/deck-fig/figures/mat-pdf/0.png";
    await seedR2(env, materialKey, "pdf-bytes");
    await seedR2(env, figureKey, "png-bytes");
    await seedR2(env, "materials/other-deck/keep.pdf", "keep");
    await seedMaterial(env, {
      id: "mat-pdf",
      deck_id: "deck-fig",
      kind: "pdf",
      r2_key: materialKey,
      filename: "mat-pdf.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-fig",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getR2Keys(env))).toEqual(["materials/other-deck/keep.pdf"]);
    expect((await getMaterials(env))).toHaveLength(0);
  });

  it("returns 404 when deleting another user's deck", async () => {
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
