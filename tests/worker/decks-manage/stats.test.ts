import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
  seedCard,
  seedDeck,
  seedMaterial,
  seedSubject,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

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

describe("GET /api/decks/:id/stats", () => {
  it("returns accepted, draft, archived, and materials counts", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-acc",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q"',
      back_json: '"A"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-draft",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q2"',
      back_json: '"A2"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "c-arch",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q3"',
      back_json: '"A3"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "archived",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-1",
      kind: "paste",
      r2_key: "materials/deck-1/mat-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-1/stats",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accepted: 1,
      draft: 1,
      archived: 1,
      materials: 1,
    });
  });
});
