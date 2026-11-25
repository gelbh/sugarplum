import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type CardBody = {
  id: string;
  deck_id: string;
  type: string;
  front: string | Record<string, unknown>;
  back: string | { answer: string };
  status: string;
  options?: string[];
  media_r2_keys?: string[];
};

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bones",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...extra,
  };
}

describe("GET /api/decks/:id/cards", () => {
  it("lists empty accepted cards for an owned deck", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/cards",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists only accepted cards", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedCard(env, {
      id: "c-acc",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Accepted Q?"),
      back_json: JSON.stringify("Accepted A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-draft",
      deck_id: "deck-a",
      job_id: null,
      type: "qa",
      front_json: JSON.stringify("Draft Q?"),
      back_json: JSON.stringify("Draft A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/cards",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(200);
    const list = (await res.json()) as CardBody[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "c-acc",
      deck_id: "deck-a",
      type: "qa",
      front: "Accepted Q?",
      back: "Accepted A",
      status: "accepted",
    });
  });

  it("returns 404 for another user's deck", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-b/cards",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(404);
  });
});
