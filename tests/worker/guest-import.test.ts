import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getSchedules,
  resetTestDb,
  seedDeck,
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

describe("POST /api/guest/import", () => {
  it("returns 401 without session", async () => {
    const env = cfEnv;

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
    const env = cfEnv;
    await seedOwner(env);

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

    const cards = (await getCards(env));
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

    const schedules = (await getSchedules(env));
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
    const env = cfEnv;
    await seedOwner(env);

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
    expect((await getCards(env))).toHaveLength(0);

    const { results: subjects } = await env.DB.prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all();
    expect(subjects).toHaveLength(0);
  });

  it("merges import into existing deck by folded title", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-anatomy",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
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

    const cards = (await getCards(env));
    expect(cards).toHaveLength(1);
    expect(cards[0].deck_id).toBe("deck-anatomy");
  });

  it("places miss decks under existing Unfiled subject", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
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
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-bio",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-bio-old",
      user_id: "user-a",
      title: "Bio",
      subject_hint: null,
      subject_id: "subj-bio",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedDeck(env, {
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
    const cards = (await getCards(env));
    expect(cards).toHaveLength(1);
    expect(cards[0].deck_id).toBe("deck-bio-old");
  });

  it("skips duplicate content_fp on sequential imports into the same deck", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-a",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
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

    const first = await app.request(
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
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { cardCount: number };
    expect(firstBody.cardCount).toBe(1);

    const second = await app.request(
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
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { cardCount: number };
    expect(secondBody.cardCount).toBe(0);

    const cards = (await getCards(env));
    expect(cards).toHaveLength(1);
  });

  it("appends a different stem on a later import into the same deck", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-a",
      user_id: "user-a",
      title: "Science",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Anatomy",
      subject_hint: null,
      subject_id: "subj-a",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const first = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: "anatomy" }],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "First front",
              back: "First back",
            },
          ],
        }),
      },
      env,
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          decks: [{ clientId: "guest-deck-1", title: "anatomy" }],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              front: "Second front",
              back: "Second back",
            },
          ],
        }),
      },
      env,
    );
    expect(second.status).toBe(200);

    const cards = (await getCards(env));
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.deck_id === "deck-a")).toBe(true);
  });

  it("coalesces same-payload fold-equal miss decks into one", async () => {
    const env = cfEnv;
    await seedOwner(env);

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

    const cards = (await getCards(env));
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.deck_id === decks![0].id)).toBe(true);
  });

  it("places miss decks under the oldest Unfiled subject", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-unfiled-old",
      user_id: "user-a",
      title: "Unfiled",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
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
    const env = cfEnv;
    await seedOwner(env);

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
    expect((await getCards(env))).toHaveLength(0);
  });

  it("returns 400 when clientDeckId is unknown", async () => {
    const env = cfEnv;
    await seedOwner(env);

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
    expect((await getCards(env))).toHaveLength(0);
  });

  it("returns 400 when decks repeat clientId", async () => {
    const env = cfEnv;
    await seedOwner(env);

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
    expect((await getCards(env))).toHaveLength(0);
  });

  it("matches import subjects by folded title to existing", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-science",
      user_id: "user-a",
      title: "Science",
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
          subjects: [{ clientId: "guest-sub-1", title: " SCIENCE " }],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Bio",
              clientSubjectId: "guest-sub-1",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "qa",
              front: "Cell?",
              back: "Unit",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);

    const { results: subjects } = await env.DB.prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; title: string }>();
    expect(subjects).toHaveLength(1);
    expect(subjects![0].id).toBe("subj-science");

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].subject_id).toBe("subj-science");
  });

  it("creates a new subject on fold miss", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [{ clientId: "guest-sub-bio", title: "Biology" }],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Cells",
              clientSubjectId: "guest-sub-bio",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "qa",
              front: "Q",
              back: "A",
              source: "hub",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);

    const { results: subjects } = await env.DB.prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; title: string }>();
    expect(subjects).toHaveLength(1);
    expect(subjects![0].title).toBe("Biology");

    const cards = (await getCards(env));
    expect(JSON.parse(cards[0].provenance_json!)).toEqual({
      guest_import: true,
      source: "hub",
    });
  });

  it("does not reparent a deck when title matches but clientSubjectId differs", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "subj-anatomy",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "subj-biology",
      user_id: "user-a",
      title: "Biology",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-anatomy",
      user_id: "user-a",
      title: "Heart",
      subject_hint: null,
      subject_id: "subj-anatomy",
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
          subjects: [{ clientId: "guest-sub-bio", title: "Biology" }],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "heart",
              clientSubjectId: "guest-sub-bio",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "qa",
              front: "Q",
              back: "A",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);

    const { results: decks } = await env.DB.prepare(
      "SELECT id, subject_id FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].id).toBe("deck-anatomy");
    expect(decks![0].subject_id).toBe("subj-anatomy");
  });

  it("imports cloze with multiple blanks", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Cloze deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "cloze",
              front: "{{c1::one}} and {{c2::two}}",
              back: "",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await getCards(env))).toHaveLength(1);
    expect((await getCards(env))[0]?.type).toBe("cloze");
  });

  it("imports cloze with empty back", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Cloze deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "cloze",
              front: "Water moves by {{c1::osmosis}}",
              back: "",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const cards = (await getCards(env));
    expect(cards[0].type).toBe("cloze");
    expect(cards[0].back_json).toBe(JSON.stringify(""));
  });

  it("imports mcq with validated options", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "MCQ deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "mcq",
              front: "Pick one",
              back: "B",
              options: ["A", "B", "C"],
              source: "hub",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const cards = (await getCards(env));
    expect(cards[0].type).toBe("mcq");
    expect(JSON.parse(cards[0].back_json!)).toEqual({
      answer: "B",
      options: ["A", "B", "C"],
    });
  });

  it("returns 400 for mcq without valid options", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Bad MCQ",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "mcq",
              front: "Pick",
              back: "X",
              options: ["A", "B"],
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getCards(env))).toHaveLength(0);
  });

  it("places new decks under Unfiled when clientSubjectId is unknown", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [{ clientId: "guest-sub-1", title: "Physics" }],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Orphan deck",
              clientSubjectId: "unknown-subject-id",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "qa",
              front: "Q",
              back: "A",
              source: "paste",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);

    const { results: subjects } = await env.DB.prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ id: string; title: string }>();
    const unfiled = (subjects ?? []).find((s) => s.title === "Unfiled");
    expect(unfiled).toBeTruthy();

    const { results: decks } = await env.DB.prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind("user-a")
      .all<{ subject_id: string | null }>();
    expect(decks).toHaveLength(1);
    expect(decks![0].subject_id).toBe(unfiled!.id);
  });

  it("returns 400 for invalid card source", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/guest/import",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          subjects: [],
          decks: [
            {
              clientId: "guest-deck-1",
              title: "Deck",
              clientSubjectId: "",
            },
          ],
          cards: [
            {
              clientDeckId: "guest-deck-1",
              type: "qa",
              front: "Q",
              back: "A",
              source: "llm",
            },
          ],
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getCards(env))).toHaveLength(0);
  });
});
