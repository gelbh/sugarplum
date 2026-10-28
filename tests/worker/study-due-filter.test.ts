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
  env.seedSession("sess-a", "user-a");
}

function seedAcceptedDue(
  env: ReturnType<typeof createTestEnv>,
  cardId: string,
  deckId: string,
) {
  env.seedCard({
    id: cardId,
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front_json: JSON.stringify(`${cardId}?`),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: "accepted",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSchedule({
    card_id: cardId,
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

/** Two decks under one subject, each with a due accepted card. */
function seedScopedFixture(env: ReturnType<typeof createTestEnv>) {
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
  env.seedDeck({
    id: "deck-2",
    user_id: "user-a",
    title: "Muscles",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-02T00:00:00.000Z",
  });
  seedAcceptedDue(env, "card-1", "deck-1");
  seedAcceptedDue(env, "card-2", "deck-2");
}

describe("GET /api/study/due filter", () => {
  it("filters to one deck when deckId is set", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);

    const res = await app.request(
      "/api/study/due?deckId=deck-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; deck_id: string }[];
    expect(body.map((c) => c.id).sort()).toEqual(["card-1"]);
    expect(body[0]!.deck_id).toBe("deck-1");
  });

  it("returns all due cards in a subject when subjectId is set", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
    env.seedSubject({
      id: "sub-other",
      user_id: "user-a",
      title: "Other",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-other",
      user_id: "user-a",
      title: "Other deck",
      subject_hint: null,
      subject_id: "sub-other",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    seedAcceptedDue(env, "card-other", "deck-other");

    const res = await app.request(
      "/api/study/due?subjectId=sub-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((c) => c.id).sort()).toEqual(["card-1", "card-2"]);
  });

  it("returns 400 when both deckId and subjectId are set", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);

    const res = await app.request(
      "/api/study/due?deckId=deck-1&subjectId=sub-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 for missing deckId", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);

    const res = await app.request(
      "/api/study/due?deckId=missing-deck",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's deckId", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
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
      title: "Private",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    seedAcceptedDue(env, "card-b", "deck-b");

    const res = await app.request(
      "/api/study/due?deckId=deck-b",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's subjectId", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
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
      "/api/study/due?subjectId=sub-b",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("omits both params and keeps global due behavior", async () => {
    const env = createTestEnv();
    seedScopedFixture(env);
    env.seedSubject({
      id: "sub-2",
      user_id: "user-a",
      title: "Other",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-3",
      user_id: "user-a",
      title: "Other deck",
      subject_hint: null,
      subject_id: "sub-2",
      created_at: "2026-01-03T00:00:00.000Z",
    });
    seedAcceptedDue(env, "card-3", "deck-3");

    const res = await app.request(
      "/api/study/due",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.map((c) => c.id).sort()).toEqual([
      "card-1",
      "card-2",
      "card-3",
    ]);
  });
});
