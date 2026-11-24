import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getStudyClaims,
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  attachClaimIdsToDrafts,
  insertDraftCards,
} from "../../worker/generation/gap-fill";
import type { StoredClaim } from "../../worker/generation/claims";
import { CardDraftSchema } from "../../worker/generation/schema";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("persist study_claims + card claim_id", () => {
  it("inserts all claims and joins matched drafts by excerpt", async () => {
    const env = cfEnv;
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
      status: "running",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });

    const claims: StoredClaim[] = [
      {
        id: "cl-match",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan",
        source_span: "Lysozyme digests peptidoglycan",
      },
      {
        id: "cl-orphan",
        subject: "ATP",
        predicate: "stores energy",
        source_span: "ATP stores energy",
      },
    ];
    const matched = CardDraftSchema.parse({
      type: "qa",
      front: "What does lysozyme digest?",
      back: "Peptidoglycan",
      provenance: {
        pages: [1],
        excerpt: "Lysozyme digests peptidoglycan",
      },
    });
    const unmatched = CardDraftSchema.parse({
      type: "qa",
      front: "Glossary term?",
      back: "ATP",
      provenance: { pages: [1], excerpt: "unrelated rules harvest" },
    });

    await insertDraftCards(env.DB, {
      deckId: "deck-a",
      jobId: "job-a",
      drafts: attachClaimIdsToDrafts([matched, unmatched], claims),
      claims,
    });

    expect((await getStudyClaims(env))).toHaveLength(2);
    const cards = (await getCards(env)).filter((c) => c.job_id === "job-a");
    expect(cards).toHaveLength(2);
    const byFront = new Map(
      cards.map((c) => [JSON.parse(c.front_json) as string, c]),
    );
    expect(byFront.get("What does lysozyme digest?")!.claim_id).toBe("cl-match");
    expect(byFront.get("Glossary term?")!.claim_id).toBeNull();
  });
});
