import { env as cfEnv } from "cloudflare:workers";
import {
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

describe("decks list scoping", () => {
  it("lists only the current user's decks", async () => {
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
      title: "A deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "B deck",
      subject_hint: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

    const res = await app.request(
      "/api/decks",
      {
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const decks = (await res.json()) as { id: string; title: string }[];
    expect(decks).toEqual([
      {
        id: "deck-a",
        title: "A deck",
        subject_hint: null,
        subject_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
