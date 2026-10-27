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
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; title: string; subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].title).toBe("Paste deck");
    expect(decks![0].subject_id).toBeTruthy();
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

    const { results: subjects } = await env.DB.prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all();
    expect(subjects).toHaveLength(0);
  });

  it("merges import into existing deck by folded title", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "subj-anatomy",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-anatomy",
      user_id: "user-a",
      title: "Anatomy",
      subject_hint: null,
      subject_id: "subj-anatomy",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: " anatomy " }],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "What is a neuron?",
              back: "A nerve cell",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deckCount: 1, cardCount: 1 });

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].id).toBe("deck-anatomy");
    expect(decks![0].subject_id).toBe("subj-anatomy");

    const cards = env.getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].deck_id).toBe("deck-anatomy");
  });

  it("places miss decks under existing Unfiled subject", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "subj-unfiled",
      user_id: "user-a",
      title: "Unfiled",
      created_at: "2026-01-01T00:00:00.000Z",
    });

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
              front: "Q",
              back: "A",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].subject_id).toBe("subj-unfiled");

    const { results: subjects } = await env.DB.prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; title: string }>();
    const unfiled = (subjects ?? []).filter((s) => s.title === "Unfiled");
    expect(unfiled).toHaveLength(1);
    expect(unfiled[0].id).toBe("subj-unfiled");
  });

  it("matches duplicate folded titles to the oldest deck", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "subj-bio",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-bio-old",
      user_id: "user-a",
      title: "Bio",
      subject_hint: null,
      subject_id: "subj-bio",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-bio-new",
      user_id: "user-a",
      title: "bio",
      subject_hint: null,
      subject_id: "subj-bio",
      created_at: "2026-01-03T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: "BIO" }],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "Cell?",
              back: "Unit of life",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const cards = env.getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].deck_id).toBe("deck-bio-old");
  });

  it("appends cards on sequential imports into the same matching deck", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "subj-a",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Anatomy",
      subject_hint: null,
      subject_id: "subj-a",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const payload = {
      decks: [{ clientId: "guest-deck-1", title: "anatomy" }],
      cards: [
        {
          clientDeckId: "guest-deck-1",
          front: "Same front",
          back: "Same back",
        },
      ],
    };

    for (let i = 0; i < 2; i++) {
      const res = await app.request(
        "/api/guest/import",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${SESSION_COOKIE}=sess-a`,
          },
          body: JSON.stringify(payload),
        },
        env,
      );
      expect(res.status).toBe(200);
    }

    const cards = env.getCards();
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.deck_id === "deck-a")).toBe(true);
  });

  it("coalesces same-payload fold-equal miss decks into one", async () => {
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
            { clientId: "guest-deck-1", title: "Anatomy" },
            { clientId: "guest-deck-2", title: "anatomy" },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "Q1",
              back: "A1",
            },
            {
              clientDeckId: "guest-deck-2",
              front: "Q2",
              back: "A2",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deckCount: 2, cardCount: 2 });

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string }>();
    expect(decks).toHaveLength(1);

    const cards = env.getCards();
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.deck_id === decks![0].id)).toBe(true);
  });

  it("places miss decks under the oldest Unfiled subject", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedSubject({
      id: "subj-unfiled-old",
      user_id: "user-a",
      title: "Unfiled",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSubject({
      id: "subj-unfiled-new",
      user_id: "user-a",
      title: "Unfiled",
      created_at: "2026-01-02T00:00:00.000Z",
    });

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
              front: "Q",
              back: "A",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].subject_id).toBe("subj-unfiled-old");
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
  });
});
