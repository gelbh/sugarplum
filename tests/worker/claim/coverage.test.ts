import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedStudyClaim,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import {
  buildClaimCoverage,
  type ClaimCoverage,
} from "../../../worker/generation/claim-coverage";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("buildClaimCoverage", () => {
  it("maps one row per claim and summarizes linked vs orphan", () => {
    const cov = buildClaimCoverage([
      {
        id: "cl-1",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan",
        object: null,
        card_id: "card-a",
      },
      {
        id: "cl-2",
        subject: "IgA",
        predicate: "protects mucosa",
        object: null,
        card_id: null,
      },
    ]);
    expect(cov.summary).toEqual({ total: 2, linked: 1, orphan: 1 });
    expect(cov.claims).toEqual([
      {
        id: "cl-1",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan",
        object: null,
        card_id: "card-a",
      },
      {
        id: "cl-2",
        subject: "IgA",
        predicate: "protects mucosa",
        object: null,
        card_id: null,
      },
    ]);
  });

  it("returns empty summary when there are no claims", () => {
    expect(buildClaimCoverage([])).toEqual({
      claims: [],
      summary: { total: 0, linked: 0, orphan: 0 },
    });
  });
});

describe("GET /api/jobs/:id/claim-coverage", () => {
  async function seedOwnerJob(env: Bindings) {
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

  it("returns linked and orphan claims for the job owner", async () => {
    const env = cfEnv;
    await seedOwnerJob(env);
    await seedStudyClaim(env, {
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
    await seedStudyClaim(env, {
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
    await seedCard(env, {
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
    const body = (await res.json()) as ClaimCoverage;
    expect(body.summary).toEqual({ total: 2, linked: 1, orphan: 1 });
    expect(body.claims.find((c) => c.id === "cl-linked")?.card_id).toBe(
      "card-linked",
    );
    expect(body.claims.find((c) => c.id === "cl-orphan")?.card_id).toBeNull();
    for (const claim of body.claims) {
      expect(claim).not.toHaveProperty("source_span");
      expect(claim).not.toHaveProperty("pages");
    }
  });

  it("returns one row per claim preferring the earliest linked card", async () => {
    const env = cfEnv;
    await seedOwnerJob(env);
    await seedStudyClaim(env, {
      id: "cl-1",
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
    await seedCard(env, {
      id: "card-a",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Earlier card"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:03:00.000Z",
      updated_at: "2026-01-01T01:03:00.000Z",
      claim_id: "cl-1",
    });
    await seedCard(env, {
      id: "card-b",
      deck_id: "deck-a",
      job_id: "job-a",
      type: "qa",
      front_json: JSON.stringify("Later card"),
      back_json: JSON.stringify("B"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:04:00.000Z",
      updated_at: "2026-01-01T01:04:00.000Z",
      claim_id: null,
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
    expect(body.summary).toEqual({ total: 1, linked: 1, orphan: 0 });
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]?.card_id).toBe("card-a");
  });

  it("returns 404 for non-owner or missing job", async () => {
    const env = cfEnv;
    await seedOwnerJob(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

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
  async function seedDeckWithTwoJobs(env: Bindings) {
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
    await seedMaterial(env, {
      id: "mat-b",
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
    await seedGenerationJob(env, {
      id: "job-b",
      material_id: "mat-b",
      status: "done",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T02:00:00.000Z",
      finished_at: "2026-01-01T02:05:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
  }

  it("aggregates claims across jobs for the deck owner", async () => {
    const env = cfEnv;
    await seedDeckWithTwoJobs(env);
    await seedStudyClaim(env, {
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
    await seedStudyClaim(env, {
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
    await seedCard(env, {
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
    const env = cfEnv;
    await seedDeckWithTwoJobs(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

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
