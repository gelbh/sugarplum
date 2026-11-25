import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getQueueMessages,
  getSchedules,
  getStudyClaims,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSchedule,
  seedSession,
  seedStudyClaim,
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
  it("owner regen wipes all card statuses, resets job, and requeues same ids", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);
    await seedStudyClaim(env, {
      id: "cl-stale",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Stale",
      predicate: "claim",
      source_span: "Stale claim",
      object: null,
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T01:06:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    expect((await getStudyClaims(env))).toEqual([]);
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

    expect((await getCards(env)).filter((c) => c.job_id === "job-a")).toHaveLength(0);
    expect((await getSchedules(env))).toHaveLength(0);

    const jobs = (await getGenerationJobs(env));
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

    const queued = getQueueMessages() as {
      jobId: string;
      materialId: string;
      deckId: string;
    }[];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual({
      jobId: "job-a",
      materialId: "mat-a",
      deckId: "deck-a",
      autoFollowup: false,
    });
  });

  it("does not insert a second generation_jobs row", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);

    const res = await app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(200);
    expect((await getGenerationJobs(env)).map((j) => j.id)).toEqual(["job-a"]);
  });
});
