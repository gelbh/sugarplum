import { describe, expect, it, vi } from "vitest";
import { processGenerateJob } from "../../worker/generation/consumer";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import {
  extractSidecarKey,
  getExtractSidecar,
} from "../../worker/generation/extractSidecar";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import { createTestEnv } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
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
  env.seedSession("sess-a", "user-a");
}

async function seedPasteJob(
  env: ReturnType<typeof createTestEnv>,
  text: string,
) {
  env.seedMaterial({
    id: "mat-1",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-1.txt",
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedR2("materials/deck-a/mat-1.txt", text);
  const jobId = await enqueueGeneration(env, {
    materialId: "mat-1",
    deckId: "deck-a",
  });
  return { jobId, materialId: "mat-1", deckId: "deck-a" };
}

function spyLlm(base: LlmAdapter = mockLlmAdapter()): LlmAdapter & {
  generateDrafts: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
} {
  return {
    generateDrafts: vi.fn(base.generateDrafts.bind(base)),
    complete: vi.fn(base.complete.bind(base)),
  };
}

describe("generation workflow step helpers", () => {
  it("pass1 persists drafts + sidecar without finalizing; afterPersist reaches needs_review", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const llm = mockLlmAdapter();

    const pass1 = await processGenerateJob(env, msg, {
      llm,
      phase: "pass1",
    });
    expect(pass1).toBe("done");
    expect(env.getCards().length).toBeGreaterThan(0);
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("running");
    expect(env.getR2Keys()).toContain(extractSidecarKey(msg.jobId));
    const sidecar = await getExtractSidecar(env, msg.jobId);
    expect(sidecar?.drafts.length).toBeGreaterThan(0);

    const after = await processGenerateJob(env, msg, {
      llm,
      phase: "afterPersist",
    });
    expect(after).toBe("done");
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect(await getExtractSidecar(env, msg.jobId)).toBeNull();
  });

  it("afterPersist soft-fails gap-fill and still finalizes (V2)", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const msg = await seedPasteJob(
      env,
      [
        "Mitochondria are the powerhouse of the cell.",
        "The hypoglossal nerve is cranial nerve twelve.",
      ].join("\n"),
    );

    let generateCalls = 0;
    const llm = spyLlm({
      async generateDrafts(input) {
        generateCalls += 1;
        if (generateCalls === 1) {
          return mockLlmAdapter().generateDrafts(input);
        }
        throw new Error("gap-fill model boom");
      },
      async complete(input) {
        return mockLlmAdapter().complete(input);
      },
    });

    await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm, phase: "pass1" },
    );
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("running");
    const pass1Cards = env.getCards().length;
    expect(pass1Cards).toBeGreaterThan(0);

    const after = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm, phase: "afterPersist" },
    );
    expect(after).toBe("done");
    expect(env.getCards()).toHaveLength(pass1Cards);
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
  });

  it("afterPersist soft-finalizes when sidecar is missing but drafts exist", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const llm = mockLlmAdapter();

    await processGenerateJob(env, msg, { llm, phase: "pass1" });
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("running");
    await env.MATERIALS.delete(extractSidecarKey(msg.jobId));

    const after = await processGenerateJob(env, msg, {
      llm,
      phase: "afterPersist",
    });
    expect(after).toBe("done");
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect(env.getCards().length).toBeGreaterThan(0);
  });
});
