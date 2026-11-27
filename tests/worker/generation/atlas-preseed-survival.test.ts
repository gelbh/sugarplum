import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getGenerationJobs,
  getStudyClaims,
  resetTestDb,
  seedAtlas,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedStudyClaim,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  AtlasPrecraftReseedError,
  atlasJobHasExtras,
  atlasLockedStubMaterial,
  insertPrecraftDrafts,
  precraftFrontMatchesAvoid,
  reseedAtlasAfterWipe,
  reseedAtlasPrecraftForJob,
  resolveMergedAtlasEntryForReseed,
} from "../../../worker/atlas/reseedPrecraft";
import { parseAtlasJobProvenance } from "../../../worker/atlas/makeCardsSource";
import { buildAtlasPrecraftDrafts } from "../../../worker/atlas/precraftDrafts";
import { emptyParasiteFields } from "../../../worker/atlas/templates/parasite";
import { insertDraftCards } from "../../../worker/generation/gap-fill";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedAtlasJob(env: typeof cfEnv, materialText: string) {
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
    title: "Atlas deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedMaterial(env, {
    id: "mat-atlas",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-atlas.txt",
    filename: "atlas-ascaris-suum.txt",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedR2(env, "materials/deck-a/mat-atlas.txt", materialText);
  const provenance = {
    atlasEntryId: "ascaris-suum",
    citations: ["WCVM Learn About Parasites: Ascaris suum"],
  };
  await seedGenerationJob(env, {
    id: "job-atlas",
    material_id: "mat-atlas",
    status: "running",
    error: null,
    coverage_json: null,
    progress_json: JSON.stringify({
      stage: "extract",
      current: 0,
      total: 1,
      percent: 10,
      label: "Extracting",
      updated_at: "2026-01-01T00:00:00.000Z",
    }),
    created_at: "2026-01-01T00:00:00.000Z",
    finished_at: null,
    atlas_provenance_json: JSON.stringify(provenance),
  });
  await seedStudyClaim(env, {
    id: "claim-old",
    deck_id: "deck-a",
    job_id: "job-atlas",
    subject: "junk",
    predicate: "is",
    object: "old",
    source_span: "Major organ",
    qualifiers_json: null,
    pages_json: null,
    created_at: "2026-01-01T00:00:01.000Z",
  });
  await seedCard(env, {
    id: "card-old",
    deck_id: "deck-a",
    job_id: "job-atlas",
    type: "qa",
    front_json: JSON.stringify("Major organ"),
    back_json: JSON.stringify("small intestine"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({ pages: [], excerpt: "Major organ" }),
    status: "draft",
    created_at: "2026-01-01T00:00:01.000Z",
    updated_at: "2026-01-01T00:00:01.000Z",
  });
  return provenance;
}

describe("atlas precraft survival after wipe", () => {
  it("reseeds species-anchored major-organ draft after reclaim wipe; extras append after", async () => {
    const env = cfEnv;
    const extrasText =
      "Parasite: Ascaris suum\nLifecycle order:\n1. egg\n\nGenerate leftover cards.\n";
    const provenance = await seedAtlasJob(env, extrasText);

    await env.DB.prepare("DELETE FROM study_claims WHERE job_id = ?")
      .bind("job-atlas")
      .run();
    await env.DB.prepare("DELETE FROM cards WHERE job_id = ?")
      .bind("job-atlas")
      .run();
    expect(await getCards(env)).toHaveLength(0);
    expect(await getStudyClaims(env)).toHaveLength(0);

    const decision = await reseedAtlasAfterWipe(env, {
      jobId: "job-atlas",
      deckId: "deck-a",
      atlasProvenance: { ...provenance, hasExtras: true },
      materialText: extrasText,
    });
    expect(decision).toBe("continue");

    const precraftCards = await getCards(env);
    expect(precraftCards.length).toBeGreaterThan(0);
    const organ = precraftCards.find((c) => {
      const front = JSON.parse(c.front_json) as string;
      return front.includes("Ascaris suum") && /major organ/i.test(front);
    });
    expect(organ).toBeDefined();
    expect(JSON.parse(organ!.front_json)).not.toBe("Major organ");

    // Ensure extras created_at sorts after precraft batch.
    await new Promise((r) => setTimeout(r, 5));
    await insertDraftCards(env.DB, {
      deckId: "deck-a",
      jobId: "job-atlas",
      atlasProvenance: provenance,
      drafts: [
        {
          type: "qa",
          front: "Ascaris suum leftover lifecycle?",
          back: "egg then L3",
          provenance: { pages: [], excerpt: "Lifecycle order:" },
        },
      ],
    });

    const all = await getCards(env);
    const organCard = all.find((c) => {
      const front = JSON.parse(c.front_json) as string;
      return front.includes("Ascaris suum") && /major organ/i.test(front);
    });
    const extrasCard = all.find(
      (c) =>
        JSON.parse(c.front_json) === "Ascaris suum leftover lifecycle?",
    );
    expect(organCard).toBeDefined();
    expect(extrasCard).toBeDefined();
    expect(organCard!.created_at <= extrasCard!.created_at).toBe(true);
    expect(all.some((c) => JSON.parse(c.front_json) === "Major organ")).toBe(
      false,
    );
  });

  it("stub-only regen path reseeds and returns stub_only (needs_review without LLM)", async () => {
    const env = cfEnv;
    const stub = atlasLockedStubMaterial("Ascaris suum");
    const provenance = await seedAtlasJob(env, stub);

    await env.DB.prepare("DELETE FROM study_claims WHERE job_id = ?")
      .bind("job-atlas")
      .run();
    await env.DB.prepare("DELETE FROM cards WHERE job_id = ?")
      .bind("job-atlas")
      .run();

    const decision = await reseedAtlasAfterWipe(env, {
      jobId: "job-atlas",
      deckId: "deck-a",
      atlasProvenance: { ...provenance, hasExtras: false },
      materialText: stub,
    });
    expect(decision).toBe("stub_only");

    const cards = await getCards(env);
    expect(cards.length).toBeGreaterThan(0);
    expect(
      cards.every((c) => {
        const front = JSON.parse(c.front_json) as string;
        return front.trim() !== "Major organ";
      }),
    ).toBe(true);
    expect(
      cards.some((c) => {
        const front = JSON.parse(c.front_json) as string;
        return front.includes("Ascaris suum") && /major organ/i.test(front);
      }),
    ).toBe(true);
  });

  it("throws when atlasEntryId cannot be resolved", async () => {
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
      title: "Atlas deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-missing",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-missing",
      material_id: "mat-missing",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: null,
      atlas_provenance_json: JSON.stringify({
        atlasEntryId: "not-a-real-entry",
        citations: [],
      }),
    });

    await expect(
      reseedAtlasPrecraftForJob(env, {
        jobId: "job-missing",
        deckId: "deck-a",
        atlasEntryId: "not-a-real-entry",
        citations: [],
      }),
    ).rejects.toThrow(/unresolved|not found/i);
  });

  it("non-atlas wipe leaves zero cards (no reseed)", async () => {
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
      title: "Paste deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-paste",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-paste.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-paste",
      material_id: "mat-paste",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: "2026-01-01T00:01:00.000Z",
      atlas_provenance_json: null,
    });
    await seedCard(env, {
      id: "card-paste",
      deck_id: "deck-a",
      job_id: "job-paste",
      type: "qa",
      front_json: JSON.stringify("What is X?"),
      back_json: JSON.stringify("Y"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [], excerpt: "x" }),
      status: "draft",
      created_at: "2026-01-01T00:00:01.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
    });

    await env.DB.prepare("DELETE FROM study_claims WHERE job_id = ?")
      .bind("job-paste")
      .run();
    await env.DB.prepare("DELETE FROM cards WHERE job_id = ?")
      .bind("job-paste")
      .run();

    expect(parseAtlasJobProvenance(null)).toBeNull();
    expect(await getCards(env)).toHaveLength(0);
    expect(await getGenerationJobs(env)).toHaveLength(1);
  });
});

describe("atlasJobHasExtras", () => {
  it("prefers explicit hasExtras flag over material text", () => {
    expect(
      atlasJobHasExtras({
        hasExtrasFlag: false,
        materialText: "lots of leftover lifecycle text",
        canonicalName: "Ascaris suum",
      }),
    ).toBe(false);
    expect(
      atlasJobHasExtras({
        hasExtrasFlag: true,
        materialText: atlasLockedStubMaterial("Ascaris suum"),
        canonicalName: "Ascaris suum",
      }),
    ).toBe(true);
  });

  it("derives stub-only from locked Parasite stub material", () => {
    expect(
      atlasJobHasExtras({
        hasExtrasFlag: null,
        materialText: atlasLockedStubMaterial("Ascaris suum"),
        canonicalName: "Ascaris suum",
      }),
    ).toBe(false);
    expect(
      atlasJobHasExtras({
        hasExtrasFlag: null,
        materialText:
          "Parasite: Ascaris suum\nLifecycle order:\n1. egg\n",
        canonicalName: "Ascaris suum",
      }),
    ).toBe(true);
  });

  it("missing hasExtras + full dump material → continue LLM (leftovers)", () => {
    const fullDump = [
      "Parasite: Ascaris suum",
      "Major organ: small intestine",
      "Hosts: pig",
      "",
      "Generate study cards covering hosts/family (MCQ), lifecycle order (cloze), and which diagnostic test applies at a given week (Q&A).",
    ].join("\n");
    expect(
      atlasJobHasExtras({
        hasExtrasFlag: null,
        materialText: fullDump,
        canonicalName: "Ascaris suum",
      }),
    ).toBe(true);
  });
});

describe("atlas precraft after full-dump wipe", () => {
  it("reseeds then continues with extras-only R2 when hasExtras absent on full dump", async () => {
    const env = cfEnv;
    const fullDump = [
      "Parasite: Ascaris suum",
      "Major organ: small intestine",
      "Hosts: pig",
      "",
      "Generate study cards covering hosts/family (MCQ), lifecycle order (cloze), and which diagnostic test applies at a given week (Q&A).",
    ].join("\n");
    const provenance = await seedAtlasJob(env, fullDump);

    await env.DB.prepare("DELETE FROM study_claims WHERE job_id = ?")
      .bind("job-atlas")
      .run();
    await env.DB.prepare("DELETE FROM cards WHERE job_id = ?")
      .bind("job-atlas")
      .run();

    const decision = await reseedAtlasAfterWipe(env, {
      jobId: "job-atlas",
      deckId: "deck-a",
      atlasProvenance: provenance,
      materialText: fullDump,
      materialR2Key: "materials/deck-a/mat-atlas.txt",
    });
    expect(decision).toBe("continue");
    expect((await getCards(env)).length).toBeGreaterThan(0);
    const rewritten = await env.MATERIALS.get("materials/deck-a/mat-atlas.txt");
    const body = (await rewritten!.text()) as string;
    expect(body).not.toContain("Major organ:");
    expect(body).not.toContain(
      "Generate study cards covering hosts/family (MCQ)",
    );
  });
});

describe("precraft avoid-pattern filter", () => {
  it("matches truncated avoid stems", () => {
    expect(
      precraftFrontMatchesAvoid("What is the major organ of Ascaris suum?", [
        "What is the major organ of Ascaris suum?",
      ]),
    ).toBe(true);
    expect(
      precraftFrontMatchesAvoid("What is the major organ of Ascaris suum?", [
        "What is the major organ of Ascaris suum? (reason: vague)",
      ]),
    ).toBe(true);
    expect(
      precraftFrontMatchesAvoid("What is the family of Ascaris suum?", [
        "What is the major organ of Ascaris suum?",
      ]),
    ).toBe(false);
  });

  it("insertPrecraftDrafts skips avoided fronts", async () => {
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
      title: "Atlas deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-atlas",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-avoid",
      material_id: "mat-atlas",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: null,
      atlas_provenance_json: JSON.stringify({
        atlasEntryId: "ascaris-suum",
        citations: [],
        hasExtras: false,
      }),
    });

    const built = buildAtlasPrecraftDrafts({
      entryKey: "ascaris-suum",
      canonicalName: "Ascaris suum",
      commonName: null,
      aliases: [],
      fields: {
        ...emptyParasiteFields(),
        group: "nematode",
        majorOrgan: "small intestine",
        family: "Ascarididae",
      },
    });
    const organ = built.drafts.find(
      (d) =>
        typeof d.front === "string" &&
        d.front.includes("Ascaris suum") &&
        /major organ/i.test(d.front),
    );
    expect(organ).toBeDefined();

    await insertPrecraftDrafts(env.DB, {
      deckId: "deck-a",
      jobId: "job-avoid",
      claims: built.claims,
      drafts: built.drafts,
      atlasProvenance: {
        atlasEntryId: "ascaris-suum",
        citations: [],
        hasExtras: false,
      },
      avoidPatterns: [organ!.front],
    });

    const cards = await getCards(env);
    expect(
      cards.some((c) => {
        const front = JSON.parse(c.front_json) as string;
        return front.includes("Ascaris suum") && /major organ/i.test(front);
      }),
    ).toBe(false);
    expect(
      cards.some((c) => {
        const front = JSON.parse(c.front_json) as string;
        return /family/i.test(front);
      }),
    ).toBe(true);
  });
});

describe("resolveMergedAtlasEntryForReseed atlasId", () => {
  it("fails when scoped overlay is soft-deleted (no stock revive)", async () => {
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
      title: "Atlas deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedAtlas(env, {
      id: "atlas-a",
      user_id: "user-a",
      template_key: "parasite",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await env.DB.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "entry-ascaris",
        "atlas-a",
        "Ascaris suum",
        null,
        JSON.stringify(emptyParasiteFields()),
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        "ascaris-suum",
        1,
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
      )
      .run();

    await expect(
      resolveMergedAtlasEntryForReseed(env.DB, {
        deckId: "deck-a",
        atlasEntryId: "ascaris-suum",
        atlasId: "atlas-a",
      }),
    ).rejects.toBeInstanceOf(AtlasPrecraftReseedError);
  });
});
