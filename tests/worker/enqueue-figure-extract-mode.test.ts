import { describe, it, expect } from "vitest";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import { createTestEnv } from "./test-env";

describe("enqueueGeneration figureExtractMode", () => {
  it("persists accurate mode on the job", async () => {
    const env = createTestEnv();
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-a",
      deckId: "deck-a",
      figureExtractMode: "accurate",
    });

    const job = env.getGenerationJobs().find((j) => j.id === jobId);
    expect(job?.figure_extract_mode).toBe("accurate");

    const messages = env.getQueueMessages() as Array<{ jobId: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.jobId).toBe(jobId);
  });

  it("defaults omitted mode to fast", async () => {
    const env = createTestEnv();
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-b",
      deckId: "deck-b",
    });

    const job = env.getGenerationJobs().find((j) => j.id === jobId);
    expect(job?.figure_extract_mode).toBe("fast");
  });
});
