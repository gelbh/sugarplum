import { env as cfEnv } from "cloudflare:workers";
import {
  getMaterials,
  getR2Keys,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("deck materials ownership", () => {
  it("returns 404 when pasting into another user's deck", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

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
    expect((await getMaterials(env))).toHaveLength(0);
    expect((await getR2Keys(env))).toHaveLength(0);
  });

  it("rejects paste over 100KB", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ text: "x".repeat(100 * 1024 + 1) }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("stores paste material for the deck owner", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

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
    expect((await getMaterials(env))).toHaveLength(1);
    expect((await getMaterials(env))[0]?.deck_id).toBe("deck-a");
    expect((await getR2Keys(env)).length).toBeGreaterThan(0);
  });
});
