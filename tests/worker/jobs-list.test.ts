import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
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
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("GET /api/jobs", () => {
  it("lists owner jobs that still have drafts, newest first", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
      id: "mat-a",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-a.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-old",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-new",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-02T01:00:00.000Z",
      finished_at: "2026-01-02T01:05:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-done",
      material_id: "mat-a",
      status: "done",
      error: null,
      coverage_json: null,
      created_at: "2026-01-03T01:00:00.000Z",
      finished_at: "2026-01-03T01:05:00.000Z",
    });
    env.seedCard({
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
    env.seedCard({
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
    env.seedCard({
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
    env.seedCard({
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
      deck_title: string;
      filename: string | null;
      status: string;
    }[];
    expect(body.map((j) => j.id)).toEqual(["job-new", "job-old"]);
    expect(body[0]).toMatchObject({
      id: "job-new",
      draft_count: 2,
      deck_title: "Bio",
      filename: "notes.txt",
      status: "needs_review",
    });
    expect(body[1]).toMatchObject({
      id: "job-old",
      draft_count: 1,
    });
  });

  it("returns 401 without session", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/jobs", {}, env);
    expect(res.status).toBe(401);
  });

  it("does not list another user's jobs", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Chem",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-b",
      deck_id: "deck-b",
      kind: "paste",
      r2_key: null,
      filename: "secret.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-b",
      material_id: "mat-b",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    env.seedCard({
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
