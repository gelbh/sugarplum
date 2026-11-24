import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  resetTestDb,
  seedDeck,
  seedGuestImportOwner,
  seedSubject,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("POST /api/guest/import", () => {
  it("merges import into existing deck by folded title", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);
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
    await seedGuestImportOwner(env);
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
    await seedGuestImportOwner(env);
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
    await seedGuestImportOwner(env);
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
    await seedGuestImportOwner(env);
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
    await seedGuestImportOwner(env);

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
    await seedGuestImportOwner(env);
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

  it("matches import subjects by folded title to existing", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);
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
    await seedGuestImportOwner(env);

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
    await seedGuestImportOwner(env);
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

  it("places new decks under Unfiled when clientSubjectId is unknown", async () => {
    const env = cfEnv;
    await seedGuestImportOwner(env);

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
});
