import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

describe("deck materials ownership", () => {
  it("returns 404 when pasting into another user's deck", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ text: "stolen notes" }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect(env.getMaterials()).toHaveLength(0);
    expect(env.getR2Keys()).toHaveLength(0);
  });

  it("stores paste material for the deck owner", async () => {
    const env = createTestEnv();
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ text: "my notes", filename: "notes.txt" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      kind: string;
      status: string;
      filename: string | null;
    };
    expect(body.kind).toBe("paste");
    expect(body.status).toBe("ready");
    expect(body.filename).toBe("notes.txt");
    expect(env.getMaterials()).toHaveLength(1);
    expect(env.getMaterials()[0]?.deck_id).toBe("deck-a");
    expect(env.getR2Keys().length).toBeGreaterThan(0);
  });
});

describe("decks list scoping", () => {
  it("lists only the current user's decks", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "A deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "B deck",
      subject_hint: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

    const res = await app.request(
      "/api/decks",
      {
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const decks = (await res.json()) as { id: string; title: string }[];
    expect(decks).toEqual([{ id: "deck-a", title: "A deck", subject_hint: null, created_at: "2026-01-01T00:00:00.000Z" }]);
  });
});
