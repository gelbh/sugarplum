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
