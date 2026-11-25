import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
  seedDeck,
  seedSubject,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type DeckBody = {
  id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
  created_at: string;
};

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

describe("GET /api/decks?subjectId=", () => {
  it("filters decks by subjectId", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "A",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-2",
      user_id: "user-a",
      title: "B",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "In A",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-2",
      user_id: "user-a",
      title: "In B",
      subject_hint: null,
      subject_id: "sub-2",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks?subjectId=sub-1",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const list = (await res.json()) as DeckBody[];
    expect(list).toEqual([
      {
        id: "deck-1",
        title: "In A",
        subject_hint: null,
        subject_id: "sub-1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
