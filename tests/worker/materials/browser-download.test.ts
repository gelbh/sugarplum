import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("GET /api/materials/:id/download", () => {
  it("returns paste bytes with attachment disposition", async () => {
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
    await seedR2(env, "materials/deck-a/paste-1.txt", "hello paste body");

    const res = await app.request(
      "/api/materials/paste-1/download",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello paste body");
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="notes.txt"',
    );
  });

  it("returns 404 when another user downloads", async () => {
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
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedR2(env, "materials/deck-a/paste-1.txt", "secret");
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/materials/paste-1/download",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object is missing", async () => {
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

    const res = await app.request(
      "/api/materials/paste-1/download",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });
});
