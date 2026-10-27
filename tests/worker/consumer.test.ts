import { describe, expect, it, vi } from "vitest";
import { encryptSecret } from "../../worker/crypto/secrets";
import {
  mergeAndDedupeDrafts,
  processGenerateJob,
} from "../../worker/generation/consumer";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import { CHUNK_CHAR_LIMIT } from "../../worker/generation/pipeline";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  freeGenKvKey,
} from "../../worker/generation/quota";
import type { CardDraft } from "../../worker/generation/schema";
import { createTestEnv, TEST_SECRETS_WRAP_KEY } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>, withSecret = false) {
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
  return withSecret
    ? encryptSecret("sk-test-mock-key", TEST_SECRETS_WRAP_KEY).then(
        (ciphertext) => {
          env.seedUserSecret({
            user_id: "user-a",
            provider: "mock",
            ciphertext,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          });
        },
      )
    : Promise.resolve();
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

describe("mergeAndDedupeDrafts", () => {
  it("keeps rules first and drops near-identical fronts", () => {
    const rules: CardDraft[] = [
      {
        type: "qa",
        front: "What is ATP?",
        back: "Adenosine triphosphate",
        provenance: { pages: [1], excerpt: "What is ATP :: Adenosine triphosphate" },
      },
    ];
    const llm: CardDraft[] = [
      {
        type: "qa",
        front: "  what is atp?  ",
        back: "duplicate",
        provenance: { pages: [1], excerpt: "prose" },
      },
      {
        type: "qa",
        front: "What produces ATP?",
        back: "mitochondria",
        provenance: { pages: [1], excerpt: "prose" },
      },
    ];
    const merged = mergeAndDedupeDrafts(rules, llm);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.back).toBe("Adenosine triphosphate");
    expect(merged[1]!.front).toBe("What produces ATP?");
  });
});

describe("processGenerateJob free path", () => {
  it("no secret + mock llm → needs_review and records free-gen", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm: mockLlmAdapter() });

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect(env.getCards().length).toBeGreaterThanOrEqual(1);
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
  });

  it("structured-only paste skips LLM entirely", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const llm = spyLlm();
    const msg = await seedPasteJob(
      env,
      "What is ATP :: Adenosine triphosphate\nCapital of France | Paris\n",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(env.getCards().length).toBeGreaterThanOrEqual(2);
    // Rules-only: free quota not consumed
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBeNull();
  });

  it("BYO secret preferred: uses override llm without free quota", async () => {
    const env = createTestEnv();
    await seedOwner(env, true);
    const llm = spyLlm();
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).toHaveBeenCalled();
    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBeNull();
  });

  it("cap exceeded → failed job with actionable error", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    for (let i = 0; i < FREE_GEN_DAILY_CAP; i++) {
      await consumeFreeGenSlot(env, "user-a");
    }
    const llm = spyLlm();
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/free generation|daily|Settings|BYO|UTC midnight/i);
    expect(env.getCards()).toHaveLength(0);
  });

  it("counts free-gen attempt even when generation fails afterward", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(async () => {
        throw new Error("simulated LLM failure");
      }),
      complete: vi.fn(async () => {
        throw new Error("simulated LLM failure");
      }),
    };
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).toHaveBeenCalled();
    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/simulated LLM failure/);
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
    expect(env.getCards()).toHaveLength(0);
  });

  it("fails when neither BYO secret nor Workers AI is available", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    // Remove AI binding to simulate missing Workers AI
    (env as { AI?: Ai }).AI = undefined;
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg);

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/Workers AI|Settings|API key/i);
    expect(job?.error).toMatch(/OpenAI|Anthropic|Google/i);
    expect(job?.error).not.toMatch(/Gemini/i);
    // Slot not consumed when AI binding is missing
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBeNull();
  });

  it("multi-chunk paste emits generate/critique progress with real total", async () => {
    const env = createTestEnv();
    await seedOwner(env, true);
    const base = mockLlmAdapter();
    const midGenerate: Array<{
      stage: string;
      current: number;
      total: number;
      label: string;
    }> = [];
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(async (input) => {
        const job = env.getGenerationJobs()[0];
        if (job?.progress_json) {
          midGenerate.push(JSON.parse(job.progress_json));
        }
        return base.generateDrafts(input);
      }),
      complete: vi.fn(async (args) => base.complete(args)),
    };

    const block = "x".repeat(3500);
    const msg = await seedPasteJob(env, `${block}\n\n${block}`);

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).toHaveBeenCalledTimes(2);
    expect(midGenerate.length).toBeGreaterThanOrEqual(1);
    expect(midGenerate[0]!.stage).toBe("generate");
    expect(midGenerate[0]!.total).toBeGreaterThanOrEqual(2);
    expect(midGenerate[0]!.current).toBe(0);
    expect(midGenerate[0]!.label).toMatch(/chunk 1\//);

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.progress_json).toBeTruthy();
    const final = JSON.parse(job!.progress_json!) as { stage: string; percent: number };
    expect(final.stage).toBe("persist");
    expect(final.percent).toBe(100);

    // Silence unused import if CHUNK used only for doc — ensure text actually chunks
    expect(`${block}\n\n${block}`.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);
  });
});
