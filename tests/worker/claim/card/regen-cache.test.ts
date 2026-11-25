import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
} from "../../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { regenerateClaimAwareCard } from "../../../../worker/generation/card-regen";
import type { LlmAdapter } from "../../../../worker/generation/llm";
import type { StudyClaim } from "../../../../worker/generation/claims";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../../../worker/generation/claim-card-fallback";
import {
  WORKERS_AI_MODEL,
  WorkersAiCapacityError,
} from "../../../../worker/generation/workers-ai";
import type { CompleteInput } from "../../../../worker/generation/llm";


afterEach(async () => {
  await resetTestDb(cfEnv);
});

const VALID_MCQ = JSON.stringify({
  cards: [
    {
      type: "mcq",
      front: "Which organelle produces ATP?",
      back: "Mitochondria",
      options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
      provenance: { pages: [1], excerpt: "Mitochondria produce ATP" },
    },
  ],
});

const COMPOUND_MCQ = JSON.stringify({
  cards: [
    {
      type: "mcq",
      front:
        "What is mitochondria and which pathway and how does ATP work versus glycolysis?",
      back: "Mitochondria",
      options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
      provenance: { pages: [1], excerpt: "Mitochondria produce ATP" },
    },
  ],
});

const STORED_CLAIM: StudyClaim = {
  subject: "Mitochondria",
  predicate: "produce ATP",
  object: "ATP",
  source_span: "Mitochondria produce ATP",
};

function mockRegenLlm(replies: string[]): {
  llm: LlmAdapter;
  complete: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const complete = vi.fn(async (_input: CompleteInput) => {
    const text = replies[Math.min(i++, replies.length - 1)]!;
    return { text, usage: null };
  });
  return {
    llm: {
      complete,
      generateDrafts: async () => [],
    },
    complete,
  };
}

const regenBase = {
  excerpt: "Mitochondria produce ATP",
  materialText: "",
  type: "mcq" as const,
  storedClaim: STORED_CLAIM,
  apiKey: "",
  provider: "workers-ai",
  model: WORKERS_AI_CLAIM_CARD_MODEL,
};

describe("regenerateClaimAwareCard draft cache", () => {
  it("skips LLM on second regen with the same claim/type/suffix", async () => {
    const env = cfEnv;
    const { llm, complete } = mockRegenLlm([VALID_MCQ]);
    const first = await regenerateClaimAwareCard({
      ...regenBase,
      llm,
      cache: env.CACHE,
    });
    expect(first.draft.front).toBe("Which organelle produces ATP?");
    expect(first.servedFromCache).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);

    const { llm: llm2, complete: complete2 } = mockRegenLlm([
      JSON.stringify({ cards: [] }),
    ]);
    const second = await regenerateClaimAwareCard({
      ...regenBase,
      llm: llm2,
      cache: env.CACHE,
    });
    expect(second.draft.front).toBe("Which organelle produces ATP?");
    expect(second.servedFromCache).toBe(true);
    expect(complete2).toHaveBeenCalledTimes(0);
  });

  it("misses when source_span differs", async () => {
    const env = cfEnv;
    const { llm } = mockRegenLlm([VALID_MCQ]);
    await regenerateClaimAwareCard({
      ...regenBase,
      llm,
      cache: env.CACHE,
    });

    const { llm: llm2, complete: complete2 } = mockRegenLlm([VALID_MCQ]);
    await regenerateClaimAwareCard({
      ...regenBase,
      storedClaim: {
        ...STORED_CLAIM,
        source_span: "Chloroplasts fix carbon",
      },
      llm: llm2,
      cache: env.CACHE,
    });
    expect(complete2).toHaveBeenCalledTimes(1);
  });

  it("does not cache a Layer-1 failing draft; stores successful reask under reask key", async () => {
    const env = cfEnv;
    const { llm, complete } = mockRegenLlm([COMPOUND_MCQ, VALID_MCQ]);
    const first = await regenerateClaimAwareCard({
      ...regenBase,
      llm,
      cache: env.CACHE,
    });
    expect(first.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]![0].model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
    expect(complete.mock.calls[0]![0].reasoningEffort).toBe("low");
    expect(complete.mock.calls[1]![0].model).toBe(WORKERS_AI_MODEL);
    expect(complete.mock.calls[1]![0].reasoningEffort).toBeUndefined();

    const { llm: llmBaseline, complete: completeBaseline } = mockRegenLlm([
      COMPOUND_MCQ,
      VALID_MCQ,
    ]);
    const again = await regenerateClaimAwareCard({
      ...regenBase,
      llm: llmBaseline,
      cache: env.CACHE,
    });
    expect(again.draft.front).toBe("Which organelle produces ATP?");
    // Specialist firstSuffix miss; glm qualitySuffix hits prior cache.
    expect(completeBaseline).toHaveBeenCalledTimes(1);
  });

  it("pins specialist model + reasoning low on a clean free-path write", async () => {
    const { llm, complete } = mockRegenLlm([VALID_MCQ]);
    await regenerateClaimAwareCard({
      ...regenBase,
      llm,
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]![0].model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
    expect(complete.mock.calls[0]![0].reasoningEffort).toBe("low");
  });

  it("escalates to glm once on capacity from the specialist", async () => {
    let n = 0;
    const complete = vi.fn(async (input: CompleteInput) => {
      n += 1;
      if (n === 1) {
        expect(input.model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
        throw new WorkersAiCapacityError("Workers AI is temporarily at capacity.");
      }
      expect(input.model).toBe(WORKERS_AI_MODEL);
      expect(input.reasoningEffort).toBeUndefined();
      return { text: VALID_MCQ, usage: null };
    });
    const llm: LlmAdapter = {
      complete,
      generateDrafts: async () => [],
    };
    const out = await regenerateClaimAwareCard({
      ...regenBase,
      llm,
    });
    expect(out.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("escalates remapped capacity after a prior successful complete", async () => {
    let n = 0;
    const complete = vi.fn(async (input: CompleteInput) => {
      n += 1;
      if (n === 1) {
        expect(input.model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
        // Force in-write reask then remapped capacity on the second hop.
        return { text: "not-json", usage: null };
      }
      if (n === 2) {
        expect(input.model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
        throw new WorkersAiCapacityError(
          "Workers AI is temporarily at capacity. Add your own OpenAI, Anthropic, Google, or Z.ai (free Flash) API key in Settings for BYO generation, or retry after UTC midnight.",
        );
      }
      expect(input.model).toBe(WORKERS_AI_MODEL);
      return { text: VALID_MCQ, usage: null };
    });
    const out = await regenerateClaimAwareCard({
      ...regenBase,
      llm: { complete, generateDrafts: async () => [] },
    });
    expect(out.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it("partitions cache by actual write model (specialist vs glm)", async () => {
    const env = cfEnv;
    const complete = vi.fn(async (input: CompleteInput) => {
      if (input.model === WORKERS_AI_CLAIM_CARD_MODEL) {
        throw new WorkersAiCapacityError("capacity");
      }
      expect(input.model).toBe(WORKERS_AI_MODEL);
      return { text: VALID_MCQ, usage: null };
    });
    const first = await regenerateClaimAwareCard({
      ...regenBase,
      llm: { complete, generateDrafts: async () => [] },
      cache: env.CACHE,
    });
    expect(first.servedFromCache).toBe(false);
    expect(complete).toHaveBeenCalledTimes(2);

    const complete2 = vi.fn(async (input: CompleteInput) => {
      if (input.model === WORKERS_AI_CLAIM_CARD_MODEL) {
        throw new WorkersAiCapacityError("capacity");
      }
      return { text: VALID_MCQ, usage: null };
    });
    const second = await regenerateClaimAwareCard({
      ...regenBase,
      llm: { complete: complete2, generateDrafts: async () => [] },
      cache: env.CACHE,
    });
    // Specialist miss → capacity → glm firstSuffix hits prior glm cache entry.
    expect(second.servedFromCache).toBe(true);
    expect(complete2).toHaveBeenCalledTimes(1);
  });
});
