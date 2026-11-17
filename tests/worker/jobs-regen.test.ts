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
      autoFollowup: false,
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

  it("returns 409 when job is queued", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
      id: "job-q",
      material_id: "mat-a",
      status: "queued",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    env.seedCard({
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
    expect(env.getCards()).toHaveLength(1);
    expect(env.getQueueMessages()).toHaveLength(0);
  });

  it("second concurrent regen loses CAS and returns 409 without double enqueue", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);

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
    expect(env.getQueueMessages()).toHaveLength(1);
    expect(env.getGenerationJobs()[0]!.status).toBe("queued");
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

  it("snapshots rejected fronts into avoid_patterns_json before wiping cards", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);
    env.seedGenerationJob({
      ...env.getGenerationJobs()[0]!,
      topic_hints_json: JSON.stringify(["keep-me"]),
    });
    const longFront = `Rejected stem ${"x".repeat(100)}`;
    env.seedCard({
      id: "c-rejected-long",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify(longFront),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "rejected",
      created_at: "2026-01-01T01:09:00.000Z",
      updated_at: "2026-01-01T01:09:00.000Z",
    });
    env.seedCard({
      id: "c-rejected-obj",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "occlusion",
      front_json: JSON.stringify({ regions: [{ id: "r1" }] }),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "rejected",
      created_at: "2026-01-01T01:10:00.000Z",
      updated_at: "2026-01-01T01:10:00.000Z",
    });
    env.seedCard({
      id: "c-rejected-reason",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Vague Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "rejected",
      reject_reason: "vague",
      created_at: "2026-01-01T01:11:00.000Z",
      updated_at: "2026-01-01T01:11:00.000Z",
    });
    env.seedCard({
      id: "c-rejected-bogus",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Bogus Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "rejected",
      reject_reason: "bogus",
      created_at: "2026-01-01T01:12:00.000Z",
      updated_at: "2026-01-01T01:12:00.000Z",
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
    expect(env.getCards().filter((c) => c.job_id === "job-a")).toHaveLength(0);

    const job = env.getGenerationJobs()[0]!;
    expect(job.topic_hints_json).toBe(JSON.stringify(["keep-me"]));
    const patterns = JSON.parse(job.avoid_patterns_json as string) as string[];
    expect(patterns).toContain("Rejected?");
    expect(
      patterns.some((p) => p.startsWith("Rejected stem") && p.length === 80),
    ).toBe(true);
    expect(patterns.some((p) => p.includes("regions"))).toBe(false);
    expect(patterns[0]).toBe("Vague Q? (reason: too vague)");
    expect(patterns).toContain("Bogus Q?");
  });

  it("sets avoid_patterns_json to null when no rejected string fronts", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
      id: "job-a",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
      avoid_patterns_json: JSON.stringify(["stale"]),
    });
    env.seedCard({
      id: "c-draft-only",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Draft only?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
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
    expect(env.getGenerationJobs()[0]!.avoid_patterns_json).toBeNull();
  });

  function regenWithBody(env: ReturnType<typeof createTestEnv>, body: string) {
    return app.request(
      "/api/jobs/job-a/regen",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body,
      },
      env,
    );
  }

  it("stores selected topicHints for this run only, leaving job hints untouched", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);
    env.seedGenerationJob({
      ...env.getGenerationJobs()[0]!,
      topic_hints_json: JSON.stringify(["B"]),
    });

    const res = await regenWithBody(
      env,
      JSON.stringify({ topicHints: [" A ", "Gap two"] }),
    );

    expect(res.status).toBe(200);
    const job = env.getGenerationJobs()[0]!;
    expect(job.status).toBe("queued");
    expect(job.topic_hints_json).toBe(JSON.stringify(["B"]));
    expect(job.run_topic_hints_json).toBe(JSON.stringify(["A", "Gap two"]));
    expect(JSON.parse(job.avoid_patterns_json as string)).toContain(
      "Rejected?",
    );
    expect(env.getQueueMessages()).toEqual([
      {
        jobId: "job-a",
        materialId: "mat-a",
        deckId: "deck-a",
        autoFollowup: false,
      },
    ]);
  });

  it.each([
    ["no body", undefined],
    ["empty object", "{}"],
    ["empty hints", JSON.stringify({ topicHints: [] })],
  ])("clears the previous run's hints for %s", async (_label, body) => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);
    env.seedGenerationJob({
      ...env.getGenerationJobs()[0]!,
      run_topic_hints_json: JSON.stringify(["old gap"]),
    });

    const res =
      body === undefined
        ? await app.request(
            "/api/jobs/job-a/regen",
            {
              method: "POST",
              headers: { cookie: `${SESSION_COOKIE}=sess-a` },
            },
            env,
          )
        : await regenWithBody(env, body);

    expect(res.status).toBe(200);
    expect(env.getGenerationJobs()[0]!.run_topic_hints_json).toBeNull();
  });

  it.each([
    [
      "too many hints",
      JSON.stringify({
        topicHints: Array.from({ length: 21 }, (_, i) => `h${i}`),
      }),
    ],
    ["over-length hint", JSON.stringify({ topicHints: ["x".repeat(301)] })],
    ["non-array hints", JSON.stringify({ topicHints: "a" })],
    ["array body", "[]"],
    ["number body", "42"],
    ["null body", "null"],
    ["malformed JSON", "{not json"],
  ])("returns 400 for %s without touching the job", async (_label, body) => {
    const env = createTestEnv();
    seedOwner(env);
    seedNeedsReviewJob(env);

    const res = await regenWithBody(env, body);

    expect(res.status).toBe(400);
    expect(env.getGenerationJobs()[0]!.status).toBe("needs_review");
    expect(env.getCards().filter((c) => c.job_id === "job-a")).toHaveLength(3);
    expect(env.getQueueMessages()).toHaveLength(0);
  });
});
