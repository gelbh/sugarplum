import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getWorkflowCreates,
  installWorkflowRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedStudyClaim,
  seedUser,
  setWorkflowInstance,
} from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { getFreeGenUsage } from "../../worker/generation/quota";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../worker/generation/claim-card-fallback";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const VALID_QA = JSON.stringify({
  cards: [
    {
      type: "qa",
      front: "What does IgA protect?",
      back: "Mucosa",
      provenance: { pages: [1], excerpt: "IgA protects mucosa" },
    },
  ],
});

const COMPOUND_QA = JSON.stringify({
  cards: [
    {
      type: "qa",
      front:
        "What is IgA and which mucosa and how does it protect versus IgG?",
      back: "Mucosa",
      provenance: { pages: [1], excerpt: "IgA protects mucosa" },
    },
  ],
});

async function seedOwnerNeedsReview(env: Bindings) {
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
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedGenerationJob(env, {
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

async function seedOrphanClaim(env: Bindings) {
  await seedStudyClaim(env, {
    id: "cl-orphan",
    job_id: "job-a",
    deck_id: "deck-a",
    subject: "IgA",
    predicate: "protects mucosa",
    object: null,
    source_span: "IgA protects mucosa",
    qualifiers_json: null,
    pages_json: "[1]",
    created_at: "2026-01-01T01:02:00.000Z",
  });
}

function stubWriteOnlyQa(env: Bindings, content = VALID_QA) {
  const run = vi.fn(async (_model: string, input: unknown) => {
    expect(_model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
    const messages = (
      input as { messages?: Array<{ role: string; content: string }> }
    ).messages;
    const system = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(system.toLowerCase()).not.toMatch(/extract/);
    expect(system.toLowerCase()).toMatch(/flashcard|claim|write/);
    return {
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content },
          finish_reason: "stop" as const,
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    };
  });
  env.AI = { run } as unknown as Ai;
  return run;
}

describe("POST /api/jobs/:id/claims/:claimId/generate", () => {
  it("creates a draft from an orphan claim without extract", async () => {
    const env = cfEnv;
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    const run = stubWriteOnlyQa(env);

    const res = await app.request(
      "/api/jobs/job-a/claims/cl-orphan/generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    const body = (await res.json()) as {
      id: string;
      type: string;
      front: string;
      status: string;
      job_id: string;
    };
    expect(body).toMatchObject({
      type: "qa",
      front: "What does IgA protect?",
      status: "draft",
      job_id: "job-a",
    });
    const inserted = (await getCards(env)).find((c) => c.id === body.id);
    expect(inserted?.claim_id).toBe("cl-orphan");
    expect(JSON.parse(inserted!.provenance_json!).excerpt).toBe(
      "IgA protects mucosa",
    );

    const cov = await app.request(
      "/api/jobs/job-a/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(cov.status).toBe(200);
    const coverage = (await cov.json()) as {
      summary: { total: number; linked: number; orphan: number };
      claims: Array<{ id: string; card_id: string | null }>;
    };
    expect(coverage.summary).toEqual({ total: 1, linked: 1, orphan: 0 });
    expect(coverage.claims[0]?.card_id).toBe(body.id);
  });

  it("returns 409 when the claim already has a card", async () => {
    const env = cfEnv;
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    await seedCard(env, {
      id: "card-existing",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Existing?"),
      back_json: JSON.stringify("Yes"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:03:00.000Z",
      updated_at: "2026-01-01T01:03:00.000Z",
      claim_id: "cl-orphan",
    });
    stubWriteOnlyQa(env);

    const before = (await getCards(env)).length;
    const res = await app.request(
      "/api/jobs/job-a/claims/cl-orphan/generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(409);
    expect((await getCards(env)).length).toBe(before);
  });

  it("returns 422 when Layer-1 rejects after reask and does not insert", async () => {
    const env = cfEnv;
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    let i = 0;
    const run = vi.fn(async () => {
      i += 1;
      return {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: COMPOUND_QA,
            },
            finish_reason: "stop" as const,
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
      };
    });
    env.AI = { run } as unknown as Ai;

    const before = (await getCards(env)).length;
    const res = await app.request(
      "/api/jobs/job-a/claims/cl-orphan/generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ type: "qa" }),
      },
      env,
    );
    expect(res.status).toBe(422);
    expect(i).toBeGreaterThanOrEqual(2);
    expect((await getCards(env)).length).toBe(before);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });

  it("returns 404 for missing claim or non-owner", async () => {
    const env = cfEnv;
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const missing = await app.request(
      "/api/jobs/job-a/claims/no-such/generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: "{}",
      },
      env,
    );
    expect(missing.status).toBe(404);

    const foreign = await app.request(
      "/api/jobs/job-a/claims/cl-orphan/generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: "{}",
      },
      env,
    );
    expect(foreign.status).toBe(404);
  });
});

describe("POST /api/jobs/:id/claims/fill-orphans", () => {
  it("starts Fill-all Workflow and returns 202", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    await seedStudyClaim(env, {
      id: "cl-2",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "IgG",
      predicate: "is in blood",
      object: null,
      source_span: "IgG is in blood",
      qualifiers_json: null,
      pages_json: "[1]",
      created_at: "2026-01-01T01:03:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      runId: "fill-all-job-a",
      orphanTotal: 2,
      status: "running",
    });
    expect(getWorkflowCreates()).toEqual([
      {
        id: "fill-all-job-a",
        params: { jobId: "job-a", userId: "user-a", type: "qa" },
      },
    ]);
  });

  it("returns 409 when Fill-all already in progress", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);

    const headers = {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=sess-a`,
    };
    const first = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(first.status).toBe(202);
    const second = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(second.status).toBe(409);
  });

  it("returns zeros when no orphans", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    stubWriteOnlyQa(env);

    const res = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      attempted: 0,
      filled: 0,
      remaining: 0,
      cards: [],
    });
    expect(getWorkflowCreates()).toEqual([]);
  });

  it("GET status is idle then running", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);

    const idle = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(idle.status).toBe(200);
    expect(await idle.json()).toMatchObject({
      runId: "fill-all-job-a",
      status: "idle",
    });

    await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: "{}",
      },
      env,
    );
    const running = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(await running.json()).toMatchObject({
      runId: "fill-all-job-a",
      status: "running",
    });
  });

  it("returns 404 for non-owner", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when job is not needs_review", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    await seedGenerationJob(env, {
      id: "job-a",
      material_id: "mat-a",
      status: "done",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    stubWriteOnlyQa(env);

    const res = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(409);
  });

  it("DELETE terminates an in-flight Fill-all", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedOwnerNeedsReview(env);
    await seedOrphanClaim(env);
    const headers = {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=sess-a`,
    };
    const started = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(started.status).toBe(202);

    const canceled = await app.request(
      "/api/jobs/job-a/claims/fill-orphans",
      { method: "DELETE", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(canceled.status).toBe(200);
    expect(await canceled.json()).toMatchObject({
      runId: "fill-all-job-a",
      status: "terminated",
    });
  });
});
