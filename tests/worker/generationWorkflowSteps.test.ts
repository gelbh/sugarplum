import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getR2Keys,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAfterPersistPhase } from "../../worker/generation/afterPersist";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import {
  extractSidecarKey,
  getExtractSidecar,
} from "../../worker/generation/extractSidecar";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import { runPass1Phase } from "../../worker/generation/pass1";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedOwner(env: Bindings) {
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
  await seedSession(env, "sess-a", "user-a");
}

async function seedPasteJob(
  env: Bindings,
  text: string,
) {
  await seedMaterial(env, {
    id: "mat-1",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-1.txt",
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedR2(env, "materials/deck-a/mat-1.txt", text);
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
  it("pass1 soft-completes to needs_review before afterPersist", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const llm = mockLlmAdapter();

    const pass1 = await runPass1Phase(env, msg, { llm });
    expect(pass1).toBe("done");
    expect((await getCards(env)).length).toBeGreaterThan(0);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getR2Keys(env))).toContain(extractSidecarKey(msg.jobId));
    const sidecar = await getExtractSidecar(env, msg.jobId);
    expect(sidecar?.drafts.length).toBeGreaterThan(0);

    await runAfterPersistPhase(env, msg, { llm });
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect(await getExtractSidecar(env, msg.jobId)).toBeNull();
  });

  it("afterPersist soft-fails gap-fill and still finalizes (V2)", async () => {
    const env = cfEnv;
    await seedOwner(env);
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

    await runPass1Phase(env, { ...msg, autoFollowup: true }, { llm });
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    const pass1Cards = (await getCards(env)).length;
    expect(pass1Cards).toBeGreaterThan(0);

    const after = await runAfterPersistPhase(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );
    expect(after).toBe("done");
    expect((await getCards(env))).toHaveLength(pass1Cards);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
  });

  it("afterPersist soft-finalizes when sidecar is missing but drafts exist", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const llm = mockLlmAdapter();

    await runPass1Phase(env, msg, { llm });
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    await env.MATERIALS.delete(extractSidecarKey(msg.jobId));

    const after = await runAfterPersistPhase(env, msg, { llm });
    expect(after).toBe("done");
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getCards(env)).length).toBeGreaterThan(0);
  });
});
