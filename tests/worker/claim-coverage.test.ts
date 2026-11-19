import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { buildClaimCoverage } from "../../worker/generation/claim-coverage";
import { createTestEnv } from "./test-env";

describe("buildClaimCoverage", () => {
  it("counts linked vs orphan and prefers earliest card when join duplicates", () => {
    const cov = buildClaimCoverage([
      {
        id: "cl-1",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan",
        object: null,
        source_span: "Lysozyme digests peptidoglycan",
        pages_json: "[1]",
        card_id: "card-b",
        card_status: "draft",
        card_created_at: "2026-11-19T12:00:01.000Z",
      },
      {
        id: "cl-1",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan",
        object: null,
        source_span: "Lysozyme digests peptidoglycan",
        pages_json: "[1]",
        card_id: "card-a",
        card_status: "draft",
        card_created_at: "2026-11-19T12:00:00.000Z",
      },
      {
        id: "cl-2",
        subject: "IgA",
        predicate: "protects mucosa",
        object: null,
        source_span: "IgA protects mucosa",
        pages_json: null,
        card_id: null,
        card_status: null,
        card_created_at: null,
      },
    ]);
    expect(cov.summary).toEqual({ total: 2, linked: 1, orphan: 1 });
    expect(cov.claims.find((c) => c.id === "cl-1")?.card_id).toBe("card-a");
    expect(cov.claims.find((c) => c.id === "cl-2")?.card_id).toBeNull();
    expect(cov.claims.find((c) => c.id === "cl-1")?.pages).toEqual([1]);
  });

  it("returns empty summary when there are no claims", () => {
    expect(buildClaimCoverage([])).toEqual({
      claims: [],
      summary: { total: 0, linked: 0, orphan: 0 },
    });
  });
});

describe("GET /api/jobs/:id/claim-coverage", () => {
  function seedOwnerJob(env: ReturnType<typeof createTestEnv>) {
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

  it("returns linked and orphan claims for the job owner", async () => {
    const env = createTestEnv();
    seedOwnerJob(env);
    env.seedStudyClaim({
      id: "cl-linked",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Lysozyme",
      predicate: "digests peptidoglycan",
      object: null,
      source_span: "Lysozyme digests peptidoglycan",
      qualifiers_json: null,
      pages_json: "[1]",
      created_at: "2026-01-01T01:01:00.000Z",
    });
    env.seedStudyClaim({
      id: "cl-orphan",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "IgA",
      predicate: "protects mucosa",
      object: null,
      source_span: "IgA protects mucosa",
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T01:02:00.000Z",
    });
    env.seedCard({
      id: "card-linked",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("What does lysozyme digest?"),
      back_json: JSON.stringify("Peptidoglycan"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:03:00.000Z",
      updated_at: "2026-01-01T01:03:00.000Z",
      claim_id: "cl-linked",
    });

    const res = await app.request(
      "/api/jobs/job-a/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { total: number; linked: number; orphan: number };
      claims: Array<{ id: string; card_id: string | null }>;
    };
    expect(body.summary).toEqual({ total: 2, linked: 1, orphan: 1 });
    expect(body.claims.find((c) => c.id === "cl-linked")?.card_id).toBe(
      "card-linked",
    );
    expect(body.claims.find((c) => c.id === "cl-orphan")?.card_id).toBeNull();
  });

  it("returns 404 for non-owner or missing job", async () => {
    const env = createTestEnv();
    seedOwnerJob(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const missing = await app.request(
      "/api/jobs/no-such-job/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(missing.status).toBe(404);

    const foreign = await app.request(
      "/api/jobs/job-a/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(foreign.status).toBe(404);
  });
});

describe("GET /api/decks/:id/claim-coverage", () => {
  function seedDeckWithTwoJobs(env: ReturnType<typeof createTestEnv>) {
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
    env.seedMaterial({
      id: "mat-b",
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
    env.seedGenerationJob({
      id: "job-b",
      material_id: "mat-b",
      status: "done",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T02:00:00.000Z",
      finished_at: "2026-01-01T02:05:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
  }

  it("aggregates claims across jobs for the deck owner", async () => {
    const env = createTestEnv();
    seedDeckWithTwoJobs(env);
    env.seedStudyClaim({
      id: "cl-job-a",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Lysozyme",
      predicate: "digests peptidoglycan",
      object: null,
      source_span: "Lysozyme digests peptidoglycan",
      qualifiers_json: null,
      pages_json: "[1]",
      created_at: "2026-01-01T01:01:00.000Z",
    });
    env.seedStudyClaim({
      id: "cl-job-b-orphan",
      job_id: "job-b",
      deck_id: "deck-a",
      subject: "IgA",
      predicate: "protects mucosa",
      object: null,
      source_span: "IgA protects mucosa",
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T02:01:00.000Z",
    });
    env.seedCard({
      id: "card-linked",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("What does lysozyme digest?"),
      back_json: JSON.stringify("Peptidoglycan"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T01:03:00.000Z",
      updated_at: "2026-01-01T01:03:00.000Z",
      claim_id: "cl-job-a",
    });

    const res = await app.request(
      "/api/decks/deck-a/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { total: number; linked: number; orphan: number };
      claims: Array<{
        id: string;
        card_id: string | null;
        job_id?: string | null;
      }>;
    };
    expect(body.summary).toEqual({ total: 2, linked: 1, orphan: 1 });
    expect(body.claims.find((c) => c.id === "cl-job-a")?.card_id).toBe(
      "card-linked",
    );
    expect(
      body.claims.find((c) => c.id === "cl-job-b-orphan")?.card_id,
    ).toBeNull();
    expect(body.claims.find((c) => c.id === "cl-job-a")?.job_id).toBe("job-a");
  });

  it("returns 404 for non-owner or missing deck", async () => {
    const env = createTestEnv();
    seedDeckWithTwoJobs(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const missing = await app.request(
      "/api/decks/no-such-deck/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(missing.status).toBe(404);

    const foreign = await app.request(
      "/api/decks/deck-a/claim-coverage",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(foreign.status).toBe(404);
  });
});
