import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

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
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("GET /api/jobs", () => {
  it("lists owner jobs that still have drafts, newest first", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedMaterial(env, {
      id: "mat-a",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-a.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-old",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-new",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-02T01:00:00.000Z",
      finished_at: "2026-01-02T01:05:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-done",
      material_id: "mat-a",
      status: "done",
      error: null,
      coverage_json: null,
      created_at: "2026-01-03T01:00:00.000Z",
      finished_at: "2026-01-03T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "c-old",
      deck_id: "deck-a",
      job_id: "job-old",
      type: "qa",
      front_json: JSON.stringify("Old?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    await seedCard(env, {
      id: "c-new-1",
      deck_id: "deck-a",
      job_id: "job-new",
      type: "qa",
      front_json: JSON.stringify("New 1?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-02T01:06:00.000Z",
      updated_at: "2026-01-02T01:06:00.000Z",
    });
    await seedCard(env, {
      id: "c-new-2",
      deck_id: "deck-a",
      job_id: "job-new",
      type: "qa",
      front_json: JSON.stringify("New 2?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-02T01:07:00.000Z",
      updated_at: "2026-01-02T01:07:00.000Z",
    });
    await seedCard(env, {
      id: "c-accepted",
      deck_id: "deck-a",
      job_id: "job-done",
      type: "qa",
      front_json: JSON.stringify("Done?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "accepted",
      created_at: "2026-01-03T01:06:00.000Z",
      updated_at: "2026-01-03T01:06:00.000Z",
    });

    const res = await app.request(
      "/api/jobs",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      draft_count: number;
      deck_id: string;
      deck_title: string;
      filename: string | null;
      status: string;
    }[];
    expect(body.map((j) => j.id)).toEqual(["job-new", "job-old"]);
    expect(body[0]).toMatchObject({
      id: "job-new",
      draft_count: 2,
      deck_id: "deck-a",
      deck_title: "Bio",
      filename: "notes.txt",
      status: "needs_review",
    });
    expect(body[1]).toMatchObject({
      id: "job-old",
      draft_count: 1,
      deck_id: "deck-a",
    });
  });

  it("returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request("/api/jobs", {}, env);
    expect(res.status).toBe(401);
  });

  it("does not list another user's jobs", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Chem",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-b",
      deck_id: "deck-b",
      kind: "paste",
      r2_key: null,
      filename: "secret.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-b",
      material_id: "mat-b",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    await seedCard(env, {
      id: "c-b",
      deck_id: "deck-b",
      job_id: "job-b",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });

    const res = await app.request(
      "/api/jobs",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
