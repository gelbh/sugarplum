import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  resetTestDb,
  seedConsumerOwner,
  seedGenerationJob,
  seedMaterial,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { insertDraftCards } from "../../worker/generation/consumer";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("insertDraftCards", () => {
  it("stores distinct media_r2_keys_json per draft", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    await seedMaterial(env, {
      id: "mat-media",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-media",
      material_id: "mat-media",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: null,
    });
    const provenance = { pages: [1], excerpt: "fig" };
    const drafts = [
      {
        type: "image_label" as const,
        front: "Label A",
        back: "A",
        provenance,
        mediaR2Keys: ["materials/deck-a/figures/pdf/0.png"],
      },
      {
        type: "diagram" as const,
        front: "Label B",
        back: "B",
        provenance,
        mediaR2Keys: ["materials/deck-a/figures/pdf/1.png"],
      },
    ];
    await insertDraftCards(env.DB, {
      deckId: "deck-a",
      jobId: "job-media",
      drafts,
    });
    const cards = (await getCards(env));
    expect(cards).toHaveLength(2);
    const mediaByFront = new Map(
      cards.map((c) => [
        JSON.parse(c.front_json) as string,
        JSON.parse(c.media_r2_keys_json!) as string[],
      ]),
    );
    expect(mediaByFront.get("Label A")).toEqual([
      "materials/deck-a/figures/pdf/0.png",
    ]);
    expect(mediaByFront.get("Label B")).toEqual([
      "materials/deck-a/figures/pdf/1.png",
    ]);
  });
});
