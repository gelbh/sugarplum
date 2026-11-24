import { env as cfEnv } from "cloudflare:workers";
import {
  getGenerationJobs,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedUser,
  type Bindings,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { enqueueGeneration } from "../../worker/generation/enqueue";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


async function seedMaterialGraph(env: Bindings, materialId: string, deckId: string) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: deckId,
    user_id: "user-a",
    title: "Deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedMaterial(env, {
    id: materialId,
    deck_id: deckId,
    kind: "pdf",
    r2_key: `materials/${deckId}/${materialId}.pdf`,
    filename: "notes.pdf",
    page_count: 1,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

describe("enqueueGeneration figureExtractMode", () => {
  it("persists accurate mode on the job", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedMaterialGraph(env, "mat-a", "deck-a");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-a",
      deckId: "deck-a",
      figureExtractMode: "accurate",
    });

    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId);
    expect(job?.figure_extract_mode).toBe("accurate");

    const messages = getQueueMessages() as Array<{ jobId: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.jobId).toBe(jobId);
  });

  it("defaults omitted mode to fast", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedMaterialGraph(env, "mat-b", "deck-b");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-b",
      deckId: "deck-b",
    });

    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId);
    expect(job?.figure_extract_mode).toBe("fast");
  });
});
