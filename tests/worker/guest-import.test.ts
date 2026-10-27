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
  env.seedSession("sess-a", "user-a");
}

describe("POST /api/guest/import", () => {
  it("returns 401 without session", async () => {
    const env = createTestEnv();

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decks: [], cards: [] }),
      },
      env,
    );

    expect(res.status).toBe(401);
  });

  it("imports accepted qa cards with schedules for owner", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: "Paste deck" }],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "What is osmosis?",
              back: "Water diffusion",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { deckCount: number; cardCount: number };
    expect(body).toEqual({ deckCount: 1, cardCount: 1 });

    const cards = env.getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("accepted");
    expect(cards[0].type).toBe("qa");
    expect(cards[0].job_id).toBeNull();
    expect(cards[0].front_json).toBe(JSON.stringify("What is osmosis?"));
    expect(cards[0].back_json).toBe(JSON.stringify("Water diffusion"));
    expect(JSON.parse(cards[0].provenance_json!)).toEqual({
      guest_import: true,
      source: "paste",
    });

    const schedules = env.getSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].card_id).toBe(cards[0].id);

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; title: string }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].title).toBe("Paste deck");
    expect(cards[0].deck_id).toBe(decks![0].id);
  });

  it("returns 200 with zeros for empty decks and cards", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ decks: [], cards: [] }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deckCount: 0, cardCount: 0 });
    expect(env.getCards()).toHaveLength(0);
  });

  it("returns 400 when cards exceed 200", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const cards = Array.from({ length: 201 }, (_, i) => ({
      clientDeckId: "guest-deck-1",
      front: `Q${i}`,
      back: `A${i}`,
    }));

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: "Big" }],
          cards,
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(env.getCards()).toHaveLength(0);
  });

  it("returns 400 when clientDeckId is unknown", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: "Only" }],
          cards: [
            {
              clientDeckId: "missing-deck",
              front: "Q",
              back: "A",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(env.getCards()).toHaveLength(0);
  });

  it("returns 400 when decks repeat clientId", async () => {
    const env = createTestEnv();
    seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [
            { clientId: "guest-deck-1", title: "A" },
            { clientId: "guest-deck-1", title: "B" },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "Q",
              back: "A",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(env.getCards()).toHaveLength(0);
    expect(env.getDecks()).toHaveLength(0);
  });
});
