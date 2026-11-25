import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getGenerationJobs,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedR2,
  seedUser,
} from "../../harness";
import { afterEach, describe, expect, it } from "vitest";
import { mockLlmAdapter } from "../../../../worker/generation/llm";
import { processGenerateJob } from "../../../../worker/generation/consumer";
import { enqueueGeneration } from "../../../../worker/generation/enqueue";
import { ocrSidecarKey } from "../../../../worker/materials/ocr-sidecar";
import { minimalPdfWithText } from "../../pdf-fixture";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("generate with sidecar", () => {
  it("does not fail empty when the sidecar fills the page", async () => {
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
      id: "mat-pdf",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-pdf.pdf",
      filename: "scan.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, 
      "materials/deck-a/mat-pdf.pdf",
      new TextDecoder().decode(minimalPdfWithText("")),
    );
    await seedR2(env, 
      ocrSidecarKey("deck-a", "mat-pdf"),
      JSON.stringify({
        pages: [{ page: 1, text: "Mitochondria produce ATP" }],
      }),
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });
    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );
    const job = (await getGenerationJobs(env)).find((row) => row.id === jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect((await getCards(env)).length).toBeGreaterThan(0);
  });
});
