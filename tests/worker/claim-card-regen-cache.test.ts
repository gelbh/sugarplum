import { describe, it, expect, vi } from "vitest";
import { regenerateClaimAwareCard } from "../../worker/generation/card-regen";
import type { LlmAdapter } from "../../worker/generation/llm";
import type { StudyClaim } from "../../worker/generation/claims";
import { WORKERS_AI_MODEL } from "../../worker/generation/workers-ai";
import { createTestEnv } from "./test-env";

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
  const complete = vi.fn(async (_input: { user: string }) => {
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
  model: WORKERS_AI_MODEL,
};

describe("regenerateClaimAwareCard draft cache", () => {
  it("skips LLM on second regen with the same claim/type/suffix", async () => {
    const env = createTestEnv();
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
    const env = createTestEnv();
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
    const env = createTestEnv();
    const { llm, complete } = mockRegenLlm([COMPOUND_MCQ, VALID_MCQ]);
    const first = await regenerateClaimAwareCard({
      ...regenBase,
      llm,
      cache: env.CACHE,
    });
    expect(first.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(2);

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
    expect(completeBaseline).toHaveBeenCalledTimes(1);
  });
});
