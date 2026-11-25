import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedStudyClaim,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { insertDraftCards } from "../../../worker/generation/gap-fill";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedDeckFixture(env: Bindings) {
  await seedUser(env, {
    id: "u1",
    email: "u@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "d1",
    user_id: "u1",
    title: "Deck",
    subject_hint: null,
    subject_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedMaterial(env, {
    id: "m1",
    deck_id: "d1",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedGenerationJob(env, {
    id: "j1",
    material_id: "m1",
    status: "needs_review",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
}

describe("insertDraftCards content_fp", () => {
  // idx_cards_deck_content_fp is non-unique; null-claim dedupe is call-site
  // (guest import SELECT), not INSERT UNIQUE. Fake test-env used to throw UNIQUE.
  it("allows second identical null-claim draft (no unique content_fp)", async () => {
    const env = cfEnv;
    await seedDeckFixture(env);
    const draft = {
      type: "qa" as const,
      front: "What are PAMPs?",
      back: "Microbial patterns",
      provenance: { pages: [1], excerpt: "PAMPs are…" },
    };
    const first = await insertDraftCards(env.DB, {
      deckId: "d1",
      jobId: "j1",
      drafts: [draft],
    });
    const second = await insertDraftCards(env.DB, {
      deckId: "d1",
      jobId: "j1",
      drafts: [draft],
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect((await getCards(env)).filter((c) => c.status === "draft")).toHaveLength(2);
  });

  it("allows same front with different media", async () => {
    const env = cfEnv;
    await seedDeckFixture(env);
    const a = await insertDraftCards(env.DB, {
      deckId: "d1",
      jobId: "j1",
      drafts: [
        {
          type: "image_label",
          front: "name",
          back: "A",
          mediaR2Keys: ["materials/d1/a.png"],
          provenance: { pages: [1], excerpt: "fig" },
        },
      ],
    });
    const b = await insertDraftCards(env.DB, {
      deckId: "d1",
      jobId: "j1",
      drafts: [
        {
          type: "image_label",
          front: "name",
          back: "B",
          mediaR2Keys: ["materials/d1/b.png"],
          provenance: { pages: [1], excerpt: "fig" },
        },
      ],
    });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("skips second draft with the same claim_id", async () => {
    const env = cfEnv;
    await seedDeckFixture(env);
    await seedStudyClaim(env, {
      id: "cl-1",
      job_id: "j1",
      deck_id: "d1",
      subject: "IgA",
      predicate: "protects",
      object: null,
      source_span: "IgA protects mucosa",
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T01:02:00.000Z",
    });
    const draft = {
      type: "qa" as const,
      front: "What does IgA protect?",
      back: "Mucosa",
      provenance: { pages: [1], excerpt: "IgA protects mucosa" },
      claimId: "cl-1",
    };
    const first = await insertDraftCards(env.DB, {
      deckId: "d1",
      jobId: "j1",
      drafts: [draft],
    });
    const second = await insertDraftCards(env.DB, {
      deckId: "d1",
      jobId: "j1",
      drafts: [draft],
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});
