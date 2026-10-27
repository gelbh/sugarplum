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
  env.seedSession("sess-a", "user-a");
}

function seedNeedsReviewJob(env: ReturnType<typeof createTestEnv>) {
  env.seedGenerationJob({
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
  env.seedCard({
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
  env.seedCard({
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
  env.seedCard({
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
  env.seedSchedule({
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
  it("owner regen wipes all card statuses, resets job, and requeues same ids", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);

    const res = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      material_id: string;
      status: string;
      error: string | null;
      coverage_json: string | null;
      progress: unknown;
      created_at: string;
      finished_at: string | null;
    };
    expect(body).toMatchObject({
      id: "job-a",
      material_id: "mat-a",
      status: "queued",
      error: null,
      coverage_json: null,
      progress: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });

    expect(env.getCards().filter((c) => c.job_id === "job-a")).toHaveLength(0);
    expect(env.getSchedules()).toHaveLength(0);

    const jobs = env.getGenerationJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "job-a",
      material_id: "mat-a",
      status: "queued",
      error: null,
      coverage_json: null,
      progress_json: null,
      finished_at: null,
    });

    const queued = env.getQueueMessages() as {
      jobId: string;
      materialId: string;
      deckId: string;
    }[];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual({
      jobId: "job-a",
      materialId: "mat-a",
      deckId: "deck-a",
    });
  });

  it("returns 404 for non-owner", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
    expect(env.getCards()).toHaveLength(3);
    expect(env.getGenerationJobs()).toHaveLength(1);
    expect(env.getQueueMessages()).toHaveLength(0);
  });

  it("returns 409 when job is running", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
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
    env.seedCard({
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
    expect(env.getCards()).toHaveLength(1);
    expect(env.getGenerationJobs()[0]!.status).toBe("running");
    expect(env.getQueueMessages()).toHaveLength(0);
  });

  it("does not insert a second generation_jobs row", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);

    const res = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(env.getGenerationJobs().map((j) => j.id)).toEqual(["job-a"]);
  });
});
