import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type MaterialListRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  deck_title?: string;
};

describe("GET /api/decks/:id/materials", () => {
  it("lists deck materials and hides PDF figure crops", async () => {
    const env = cfEnv;
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
    await seedMaterial(env, {
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MaterialListRow[];
    expect(body.map((row) => row.id)).toEqual(["paste-1"]);
    expect(body[0]).toMatchObject({
      id: "paste-1",
      kind: "paste",
      filename: "notes.txt",
    });
  });

  it("returns 404 when listing another user's deck materials", async () => {
    const env = cfEnv;
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
    await seedMaterial(env, {
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );

    expect(res.status).toBe(404);
  });
});
