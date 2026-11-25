import { describe, it, expect, vi } from "vitest";
import { regenerateClaimAwareCard } from "../../../worker/generation/card-regen";
import type { LlmAdapter } from "../../../worker/generation/llm";
import type { StudyClaim } from "../../../worker/generation/claims";

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

const MULTI_SENTENCE_MCQ = JSON.stringify({
  cards: [
    {
      type: "mcq",
      front: "Which organelle produces ATP?",
      back: "One fact. Two fact. Three fact.",
      options: [
        "One fact. Two fact. Three fact.",
        "Nucleus",
        "Ribosome",
        "Golgi",
      ],
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

describe("regenerateClaimAwareCard quality reask budget", () => {
  it("writes once when the first card passes Layer-1", async () => {
    const { llm, complete } = mockRegenLlm([VALID_MCQ]);
    const result = await regenerateClaimAwareCard({
      excerpt: "Mitochondria produce ATP",
      materialText: "",
      type: "mcq",
      storedClaim: STORED_CLAIM,
      llm,
      apiKey: "",
      provider: "workers-ai",
    });
    expect(result.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(String(complete.mock.calls[0]![0].user)).toMatch(
      /single-fact|quality|shorter/i,
    );
  });

  it("reasks once when Layer-1 fails with named reasons", async () => {
    const { llm, complete } = mockRegenLlm([COMPOUND_MCQ, VALID_MCQ]);
    const result = await regenerateClaimAwareCard({
      excerpt: "Mitochondria produce ATP",
      materialText: "",
      type: "mcq",
      storedClaim: STORED_CLAIM,
      llm,
      apiKey: "",
      provider: "workers-ai",
    });
    expect(result.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(String(complete.mock.calls[1]![0].user)).toContain("compound_front");
  });

  it("reasks once when Layer-1 fails with too_many_sentences", async () => {
    const { llm, complete } = mockRegenLlm([MULTI_SENTENCE_MCQ, VALID_MCQ]);
    const result = await regenerateClaimAwareCard({
      excerpt: "Mitochondria produce ATP",
      materialText: "",
      type: "mcq",
      storedClaim: STORED_CLAIM,
      llm,
      apiKey: "",
      provider: "workers-ai",
    });
    expect(result.draft.front).toBe("Which organelle produces ATP?");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(String(complete.mock.calls[1]![0].user)).toContain(
      "too_many_sentences",
    );
  });
});
