import { describe, expect, it, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { getFreeGenUsage } from "../../worker/generation/quota";
import { WORKERS_AI_MODEL } from "../../worker/generation/workers-ai";
import { createTestEnv } from "./test-env";

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

function seedOwnerNeedsReview(env: ReturnType<typeof createTestEnv>) {
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
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedGenerationJob({
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function seedOrphanClaim(env: ReturnType<typeof createTestEnv>) {
  env.seedStudyClaim({
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

function stubWriteOnlyQa(env: ReturnType<typeof createTestEnv>, content = VALID_QA) {
  const run = vi.fn(async (_model: string, input: unknown) => {
    expect(_model).toBe(WORKERS_AI_MODEL);
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
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
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
    const inserted = env.getCards().find((c) => c.id === body.id);
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
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
    env.seedCard({
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

    const before = env.getCards().length;
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
    expect(env.getCards().length).toBe(before);
  });

  it("returns 422 when Layer-1 rejects after reask and does not insert", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
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

    const before = env.getCards().length;
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
    expect(env.getCards().length).toBe(before);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });

  it("returns 404 for missing claim or non-owner", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

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
  it("fills orphan claims and returns summary cards", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
    env.seedStudyClaim({
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
    const run = vi.fn(async (_model: string, input: unknown) => {
      const messages = (
        input as { messages?: Array<{ role: string; content: string }> }
      ).messages;
      const user = messages?.find((m) => m.role === "user")?.content ?? "";
      const content = user.includes("IgG")
        ? JSON.stringify({
            cards: [
              {
                type: "qa",
                front: "Where is IgG?",
                back: "Blood",
                provenance: { pages: [1], excerpt: "IgG is in blood" },
              },
            ],
          })
        : VALID_QA;
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
    const body = (await res.json()) as {
      attempted: number;
      filled: number;
      remaining: number;
      cards: Array<{ id: string; claim_id: string | null }>;
    };
    expect(body.filled).toBe(2);
    expect(body.attempted).toBe(2);
    expect(body.remaining).toBe(0);
    expect(body.cards).toHaveLength(2);
    expect(env.getCards().filter((c) => c.claim_id != null)).toHaveLength(2);
  });

  it("returns zeros when no orphans", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
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
  });

  it("returns 404 for non-owner", async () => {
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

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
    const env = createTestEnv();
    seedOwnerNeedsReview(env);
    seedOrphanClaim(env);
    env.seedGenerationJob({
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
});
