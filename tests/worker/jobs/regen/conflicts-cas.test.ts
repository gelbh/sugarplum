import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSchedule,
  seedSession,
  seedUser,
} from "../../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../../worker/index";
import { SESSION_COOKIE } from "../../../../worker/auth/session";

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
  await seedSession(env, "sess-a", "user-a");
}

async function seedNeedsReviewJob(env: Bindings) {
  await seedGenerationJob(env, {
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: "stale",
    coverage_json: JSON.stringify({ covered: ["x"] }),
    progress_json: JSON.stringify({
      stage: "persist",
      current: 1,
      total: 1,
      percent: 100,
      label: "done",
    }),
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
  await seedCard(env, {
    id: "c-draft",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "qa",
    front_json: JSON.stringify("Draft?"),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: "draft",
    created_at: "2026-01-01T01:06:00.000Z",
    updated_at: "2026-01-01T01:06:00.000Z",
  });
  await seedCard(env, {
    id: "c-accepted",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "qa",
    front_json: JSON.stringify("Accepted?"),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: "accepted",
    created_at: "2026-01-01T01:07:00.000Z",
    updated_at: "2026-01-01T01:07:00.000Z",
  });
  await seedCard(env, {
    id: "c-rejected",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "qa",
    front_json: JSON.stringify("Rejected?"),
    back_json: JSON.stringify("A"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: "rejected",
    created_at: "2026-01-01T01:08:00.000Z",
    updated_at: "2026-01-01T01:08:00.000Z",
  });
  await seedSchedule(env, {
    card_id: "c-accepted",
    due: "2026-01-02T00:00:00.000Z",
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
  });
}

describe("POST /api/jobs/:id/regen", () => {
  it("returns 404 for non-owner", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
    expect((await getCards(env))).toHaveLength(3);
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect(getQueueMessages()).toHaveLength(0);
  });

  it("returns 409 when job is queued", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedGenerationJob(env, {
      id: "job-q",
      material_id: "mat-a",
      status: "queued",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    await seedCard(env, {
      id: "c-q",
      deck_id: "deck-a",
      job_id: "job-q",
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
      "/api/jobs/job-q/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(409);
    expect((await getCards(env))).toHaveLength(1);
    expect(getQueueMessages()).toHaveLength(0);
  });

  it("repeated regen returns 409 without double enqueue", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);

    const first = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(second.status).toBe(409);
    expect(getQueueMessages()).toHaveLength(1);
    expect((await getGenerationJobs(env))[0]!.status).toBe("queued");
  });

  it("returns 409 when job is running", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedGenerationJob(env, {
      id: "job-run",
      material_id: "mat-a",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({
        stage: "generate",
        current: 1,
        total: 3,
        percent: 30,
        label: "working",
      }),
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    await seedCard(env, {
      id: "c-run",
      deck_id: "deck-a",
      job_id: "job-run",
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
      "/api/jobs/job-run/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(409);
    expect((await getCards(env))).toHaveLength(1);
    expect((await getGenerationJobs(env))[0]!.status).toBe("running");
    expect(getQueueMessages()).toHaveLength(0);
  });
});
