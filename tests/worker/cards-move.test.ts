import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

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
  env.seedDeck({
    id: "deck-b",
    user_id: "user-a",
    title: "Chem",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function seedAcceptedCard(
  env: ReturnType<typeof createTestEnv>,
  opts: { id: string; deckId: string; status?: string },
) {
  env.seedCard({
    id: opts.id,
    deck_id: opts.deckId,
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("Q?"),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: opts.status ?? "accepted",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
}

async function postMove(
  env: ReturnType<typeof createTestEnv>,
  cardId: string,
  deckId: string,
  sessionId = "sess-a",
) {
  return app.request(
    `/api/cards/${cardId}/move`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${sessionId}`,
      },
      body: JSON.stringify({ deckId }),
    },
    env,
  );
}

describe("POST /api/cards/:id/move", () => {
  it("updates deck_id for accepted card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, { id: "card-1", deckId: "deck-a" });

    const res = await postMove(env, "card-1", "deck-b");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deck_id: string };
    expect(body.deck_id).toBe("deck-b");
    expect(env.getCards().find((c) => c.id === "card-1")!.deck_id).toBe(
      "deck-b",
    );
  });

  it("leaves card_schedules unchanged", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, { id: "card-1", deckId: "deck-a" });
    env.seedSchedule({
      card_id: "card-1",
      due: "2020-06-01T00:00:00.000Z",
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

    const res = await postMove(env, "card-1", "deck-b");
    expect(res.status).toBe(200);
    const schedules = env.getSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      card_id: "card-1",
      due: "2020-06-01T00:00:00.000Z",
      stability: 2.5,
      reps: 2,
    });
  });

  it("returns 200 for same-deck no-op", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, { id: "card-1", deckId: "deck-a" });

    const res = await postMove(env, "card-1", "deck-a");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deck_id: string };
    expect(body.deck_id).toBe("deck-a");
    expect(env.getCards().find((c) => c.id === "card-1")!.deck_id).toBe(
      "deck-a",
    );
  });

  it("returns 400 for draft card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, {
      id: "card-draft",
      deckId: "deck-a",
      status: "draft",
    });

    const res = await postMove(env, "card-draft", "deck-b");
    expect(res.status).toBe(400);
    expect(
      env.getCards().find((c) => c.id === "card-draft")!.deck_id,
    ).toBe("deck-a");
  });

  it("returns 400 for rejected card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, {
      id: "card-rej",
      deckId: "deck-a",
      status: "rejected",
    });

    const res = await postMove(env, "card-rej", "deck-b");
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's card", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, { id: "card-1", deckId: "deck-a" });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await postMove(env, "card-1", "deck-b", "sess-b");
    expect(res.status).toBe(404);
    expect(env.getCards().find((c) => c.id === "card-1")!.deck_id).toBe(
      "deck-a",
    );
  });

  it("returns 404 when target deck belongs to another user", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedAcceptedCard(env, { id: "card-1", deckId: "deck-a" });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-other",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await postMove(env, "card-1", "deck-other");
    expect(res.status).toBe(404);
    expect(env.getCards().find((c) => c.id === "card-1")!.deck_id).toBe(
      "deck-a",
    );
  });
});
