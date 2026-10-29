import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

const PAST_DUE = "2020-01-01T00:00:00.000Z";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function seedCard(
  env: ReturnType<typeof createTestEnv>,
  opts: { id: string; status: string },
) {
  env.seedCard({
    id: opts.id,
    deck_id: "deck-a",
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("Q?"),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: null,
    status: opts.status,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
}

async function postArchive(
  env: ReturnType<typeof createTestEnv>,
  cardId: string,
  sessionId = "sess-a",
) {
  return app.request(
    `/api/cards/${cardId}/archive`,
    {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
    },
    env,
  );
}

async function postRestore(
  env: ReturnType<typeof createTestEnv>,
  cardId: string,
  sessionId = "sess-a",
) {
  return app.request(
    `/api/cards/${cardId}/restore`,
    {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
    },
    env,
  );
}

describe("POST /api/cards/:id/archive", () => {
  it("sets status to archived for accepted card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-1", status: "accepted" });

    const res = await postArchive(env, "card-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("archived");
    expect(env.getCards().find((c) => c.id === "card-1")!.status).toBe(
      "archived",
    );
  });

  it("leaves card_schedules unchanged", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-1", status: "accepted" });
    env.seedSchedule({
      card_id: "card-1",
      due: PAST_DUE,
      stability: 2.5,
      difficulty: 5,
      elapsed_days: 3,
      scheduled_days: 4,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: "2020-05-28T00:00:00.000Z",
    });

    const res = await postArchive(env, "card-1");
    expect(res.status).toBe(200);
    expect(env.getSchedules()[0]).toMatchObject({
      card_id: "card-1",
      due: PAST_DUE,
      reps: 2,
    });
  });

  it("returns 400 for draft card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-draft", status: "draft" });

    const res = await postArchive(env, "card-draft");
    expect(res.status).toBe(400);
    expect(env.getCards().find((c) => c.id === "card-draft")!.status).toBe(
      "draft",
    );
  });

  it("returns 400 when already archived", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-arch", status: "archived" });

    const res = await postArchive(env, "card-arch");
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-1", status: "accepted" });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await postArchive(env, "card-1", "sess-b");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/cards/:id/restore", () => {
  it("sets status to accepted for archived card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-1", status: "archived" });

    const res = await postRestore(env, "card-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("accepted");
    expect(env.getCards().find((c) => c.id === "card-1")!.status).toBe(
      "accepted",
    );
  });

  it("returns 400 for accepted card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-1", status: "accepted" });

    const res = await postRestore(env, "card-1");
    expect(res.status).toBe(400);
  });

  it("returns 400 for draft card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-draft", status: "draft" });

    const res = await postRestore(env, "card-draft");
    expect(res.status).toBe(400);
  });
});

describe("archived cards and study due", () => {
  it("omits archived cards from GET /api/study/due", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-due", status: "accepted" });
    seedCard(env, { id: "card-arch", status: "archived" });
    for (const id of ["card-due", "card-arch"]) {
      env.seedSchedule({
        card_id: id,
        due: PAST_DUE,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: null,
      });
    }

    const res = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((c) => c.id)).toEqual(["card-due"]);
  });

  it("restore then due includes card again", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "card-1", status: "archived" });
    env.seedSchedule({
      card_id: "card-1",
      due: PAST_DUE,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });

    const restore = await postRestore(env, "card-1");
    expect(restore.status).toBe(200);

    const due = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    const body = (await due.json()) as { id: string }[];
    expect(body.map((c) => c.id)).toEqual(["card-1"]);
  });
});

describe("GET /api/decks/:id/cards archived filter", () => {
  it("lists only accepted by default and excludes archived", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "c-acc", status: "accepted" });
    seedCard(env, { id: "c-arch", status: "archived" });

    const res = await app.request(
      "/api/decks/deck-a/cards",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];
    expect(list.map((c) => c.id)).toEqual(["c-acc"]);
  });

  it("lists archived when status=archived", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedCard(env, { id: "c-acc", status: "accepted" });
    seedCard(env, { id: "c-arch", status: "archived" });

    const res = await app.request(
      "/api/decks/deck-a/cards?status=archived",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];
    expect(list.map((c) => c.id)).toEqual(["c-arch"]);
  });
});
