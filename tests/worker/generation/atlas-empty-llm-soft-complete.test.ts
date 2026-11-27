import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getGenerationJobs,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { markJobFailedOrAtlasSoftComplete } from "../../../worker/generation/pass1";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("markJobFailedOrAtlasSoftComplete", () => {
  it("atlas job with precraft cards → needs_review (not failed)", async () => {
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
      id: "job-atlas",
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
        hasExtras: true,
      }),
    });
    await seedCard(env, {
      id: "card-precraft",
      deck_id: "deck-a",
      job_id: "job-atlas",
      type: "qa",
      front_json: JSON.stringify("Ascaris suum major organ?"),
      back_json: JSON.stringify("small intestine"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({
        pages: [],
        excerpt: "Major organ: small intestine",
      }),
      status: "draft",
      created_at: "2026-01-01T00:00:01.000Z",
      updated_at: "2026-01-01T00:00:01.000Z",
    });

    await markJobFailedOrAtlasSoftComplete(
      env,
      "job-atlas",
      "No flashcard drafts could be produced from this material.",
      true,
    );

    const job = (await getGenerationJobs(env)).find((j) => j.id === "job-atlas");
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect(await getCards(env)).toHaveLength(1);
  });

  it("atlas job with zero cards → failed", async () => {
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
      id: "job-empty",
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
        hasExtras: true,
      }),
    });

    await markJobFailedOrAtlasSoftComplete(
      env,
      "job-empty",
      "No flashcard drafts could be produced from this material.",
      true,
    );

    const job = (await getGenerationJobs(env)).find((j) => j.id === "job-empty");
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/No flashcard drafts/);
  });
});
