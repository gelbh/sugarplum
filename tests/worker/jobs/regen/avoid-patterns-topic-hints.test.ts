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
  it("snapshots rejected fronts into avoid_patterns_json before wiping cards", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);
    await seedGenerationJob(env, {
      ...(await getGenerationJobs(env))[0]!,
      topic_hints_json: JSON.stringify(["keep-me"]),
    });
    const longFront = `Rejected stem ${"x".repeat(100)}`;
    await seedCard(env, {
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
    await seedCard(env, {
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
    await seedCard(env, {
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
    await seedCard(env, {
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
    expect((await getCards(env)).filter((c) => c.job_id === "job-a")).toHaveLength(0);

    const job = (await getGenerationJobs(env))[0]!;
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
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedGenerationJob(env, {
      id: "job-a",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
      avoid_patterns_json: JSON.stringify(["stale"]),
    });
    await seedCard(env, {
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
    expect((await getGenerationJobs(env))[0]!.avoid_patterns_json).toBeNull();
  });

  function regenWithBody(env: Bindings, body: string) {
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
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);
    await seedGenerationJob(env, {
      ...(await getGenerationJobs(env))[0]!,
      topic_hints_json: JSON.stringify(["B"]),
    });

    const res = await regenWithBody(
      env,
      JSON.stringify({ topicHints: [" A ", "Gap two"] }),
    );

    expect(res.status).toBe(200);
    const job = (await getGenerationJobs(env))[0]!;
    expect(job.status).toBe("queued");
    expect(job.topic_hints_json).toBe(JSON.stringify(["B"]));
    expect(job.run_topic_hints_json).toBe(JSON.stringify(["A", "Gap two"]));
    expect(JSON.parse(job.avoid_patterns_json as string)).toContain(
      "Rejected?",
    );
    expect(getQueueMessages()).toEqual([
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
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);
    await seedGenerationJob(env, {
      ...(await getGenerationJobs(env))[0]!,
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
    expect((await getGenerationJobs(env))[0]!.run_topic_hints_json).toBeNull();
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
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedNeedsReviewJob(env);

    const res = await regenWithBody(env, body);

    expect(res.status).toBe(400);
    expect((await getGenerationJobs(env))[0]!.status).toBe("needs_review");
    expect((await getCards(env)).filter((c) => c.job_id === "job-a")).toHaveLength(3);
    expect(getQueueMessages()).toHaveLength(0);
  });
});
