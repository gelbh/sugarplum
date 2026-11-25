import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getQueueMessages,
  getSchedules,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSchedule,
  seedSession,
  seedUser,
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
    id: "c-draft-2",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "qa",
    front_json: JSON.stringify("Draft 2?"),
    back_json: JSON.stringify("B"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
    status: "draft",
    created_at: "2026-01-01T01:06:30.000Z",
    updated_at: "2026-01-01T01:06:30.000Z",
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

describe("POST /api/jobs/:id/reject-drafts", () => {
  it("owner soft-clean rejects drafts only; keeps accepted; no requeue", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);

    const res = await app.request(
      "/api/jobs/job-a/reject-drafts",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rejectedCount: number };
    expect(body).toEqual({ rejectedCount: 2 });

    const byId = Object.fromEntries((await getCards(env)).map((c) => [c.id, c]));
    expect(byId["c-draft"]?.status).toBe("rejected");
    expect(byId["c-draft-2"]?.status).toBe("rejected");
    expect(byId["c-accepted"]?.status).toBe("accepted");
    expect(byId["c-rejected"]?.status).toBe("rejected");
    expect((await getCards(env))).toHaveLength(4);
    expect((await getSchedules(env))).toHaveLength(1);

    const jobs = (await getGenerationJobs(env));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "job-a",
      status: "needs_review",
      coverage_json: JSON.stringify({ covered: ["x"] }),
    });
    expect(getQueueMessages()).toHaveLength(0);
  });

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
      "/api/jobs/job-a/reject-drafts",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
    expect((await getCards(env)).filter((c) => c.status === "draft")).toHaveLength(2);
    expect(getQueueMessages()).toHaveLength(0);
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
      "/api/jobs/job-run/reject-drafts",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(409);
    expect((await getCards(env))[0]!.status).toBe("draft");
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
      "/api/jobs/job-q/reject-drafts",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(409);
    expect((await getCards(env))[0]!.status).toBe("draft");
    expect(getQueueMessages()).toHaveLength(0);
  });
});
