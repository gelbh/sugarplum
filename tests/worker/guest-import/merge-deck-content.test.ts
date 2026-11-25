import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  resetTestDb,
  seedDeck,
  seedGuestImportOwner,
  seedSubject,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


describe("POST /api/guest/import", () => {
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
});
