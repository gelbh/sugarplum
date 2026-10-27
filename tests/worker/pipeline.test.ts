import { describe, expect, it, vi } from "vitest";
import {
  CHUNK_CHAR_LIMIT,
  MAX_PIPELINE_CHUNKS,
  remainderAfterRules,
  runGenerationPipeline,
  type PipelineLlm,
} from "../../worker/generation/pipeline";
import { harvestRuleDrafts } from "../../worker/generation/rules";
import type { CardDraft } from "../../worker/generation/schema";
import { CardDraftSchema } from "../../worker/generation/schema";

function validDraft(
  overrides: Partial<CardDraft> & Pick<CardDraft, "front" | "back">,
): CardDraft {
  return CardDraftSchema.parse({
    type: "qa",
    provenance: { pages: [1], excerpt: "The mitochondria produces ATP." },
    ...overrides,
  });
}

function mockPipelineLlm(opts: {
  generate?: (text: string) => Promise<CardDraft[]>;
  complete?: (args: {
    system: string;
    user: string;
  }) => Promise<string>;
}): PipelineLlm {
  return {
    generateDrafts: vi.fn(async ({ text }) => {
      if (opts.generate) return opts.generate(text);
      return [
        validDraft({
          front: "What produces ATP?",
          back: "mitochondria",
          provenance: {
            pages: [1],
            excerpt: text.slice(0, 80) || "excerpt",
          },
        }),
      ];
    }),
    complete: vi.fn(async (args) => {
      if (opts.complete) return opts.complete(args);
      // Default: keep whatever cards appear after CANDIDATES in the user prompt
      return JSON.stringify({
        cards: [
          validDraft({
            front: "What produces ATP?",
            back: "mitochondria",
          }),
        ],
      });
    }),
  };
}

describe("runGenerationPipeline", () => {
  it("returns [] without calling LLM when text is empty or whitespace", async () => {
    const llm = mockPipelineLlm({});
    const empty = await runGenerationPipeline({
      text: "",
      llm,
      apiKey: "k",
      provider: "mock",
    });
    const ws = await runGenerationPipeline({
      text: "  \n\t  ",
      llm,
      apiKey: "k",
      provider: "mock",
    });
    expect(empty).toEqual([]);
    expect(ws).toEqual([]);
    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("chunks long text under the hard cap and processes sequentially", async () => {
    const seenChunks: string[] = [];
    const llm = mockPipelineLlm({
      generate: async (text) => {
        seenChunks.push(text);
        return [
          validDraft({
            front: `Q for chunk ${seenChunks.length}?`,
            back: "A",
            provenance: { pages: [1], excerpt: text.slice(0, 40) },
          }),
        ];
      },
      complete: async () =>
        JSON.stringify({
          cards: [
            validDraft({
              front: "kept",
              back: "yes",
            }),
          ],
        }),
    });

    // Prefer paragraph breaks: two ~3.5k blocks → two chunks under 6k.
    const block = "x".repeat(3500);
    const text = `${block}\n\n${block}`;
    expect(text.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);

    const drafts = await runGenerationPipeline({
      text,
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(seenChunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of seenChunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_CHAR_LIMIT);
    }
    expect(llm.generateDrafts).toHaveBeenCalledTimes(seenChunks.length);
    expect(drafts.length).toBeGreaterThan(0);
  });

  it("emits onProgress generate then critique per chunk with stable total", async () => {
    const events: Array<{
      stage: string;
      current: number;
      total: number;
      label: string;
      halfStepsDone: number;
    }> = [];
    const llm = mockPipelineLlm({
      generate: async (text) => [
        validDraft({
          front: `Q?`,
          back: "A",
          provenance: { pages: [1], excerpt: text.slice(0, 40) },
        }),
      ],
      complete: async () =>
        JSON.stringify({
          cards: [
            validDraft({
              front: "kept",
              back: "yes",
            }),
          ],
        }),
    });

    const block = "x".repeat(3500);
    const text = `${block}\n\n${block}`;

    await runGenerationPipeline({
      text,
      llm,
      apiKey: "k",
      provider: "mock",
      onProgress: (e) => {
        events.push({ ...e });
      },
    });

    const n = 2;
    expect(events.length).toBe(n * 4);
    for (const e of events) {
      expect(e.total).toBe(n);
    }
    // Per chunk: generate start/done, critique start/done; half-steps never rewind
    expect(events.map((e) => [e.stage, e.current, e.halfStepsDone])).toEqual([
      ["generate", 0, 0],
      ["generate", 1, 1],
      ["critique", 0, 1],
      ["critique", 1, 2],
      ["generate", 1, 2],
      ["generate", 2, 3],
      ["critique", 1, 3],
      ["critique", 2, 4],
    ]);
    let prevHalf = -1;
    for (const e of events) {
      expect(e.halfStepsDone).toBeGreaterThanOrEqual(prevHalf);
      prevHalf = e.halfStepsDone;
    }
    expect(events[0]!.label).toContain("chunk 1/2");
    expect(events[2]!.label).toContain("chunk 1/2");
    expect(events[4]!.label).toContain("chunk 2/2");
  });

  it("advances critique half-steps when generate returns empty", async () => {
    const events: Array<{ stage: string; halfStepsDone: number }> = [];
    const llm = mockPipelineLlm({
      generate: async () => [],
      complete: async () => JSON.stringify({ cards: [] }),
    });

    await runGenerationPipeline({
      text: "short remainder that is one chunk",
      llm,
      apiKey: "k",
      provider: "mock",
      onProgress: (e) => {
        events.push({ stage: e.stage, halfStepsDone: e.halfStepsDone });
      },
    });

    expect(events.map((e) => [e.stage, e.halfStepsDone])).toEqual([
      ["generate", 0],
      ["generate", 1],
      ["critique", 1],
      ["critique", 2],
    ]);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("caps generateDrafts calls at MAX_PIPELINE_CHUNKS", async () => {
    const llm = mockPipelineLlm({
      generate: async () => [
        validDraft({ front: "Q?", back: "A", provenance: { pages: [1], excerpt: "e" } }),
      ],
      complete: async () =>
        JSON.stringify({
          cards: [
            validDraft({ front: "Q?", back: "A", provenance: { pages: [1], excerpt: "e" } }),
          ],
        }),
    });

    // 6 paragraph blocks → would be 6 chunks without the cap.
    const block = "y".repeat(CHUNK_CHAR_LIMIT - 10);
    const text = Array.from({ length: 6 }, () => block).join("\n\n");

    await runGenerationPipeline({
      text,
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(llm.generateDrafts).toHaveBeenCalledTimes(MAX_PIPELINE_CHUNKS);
    expect(llm.complete).toHaveBeenCalledTimes(MAX_PIPELINE_CHUNKS);
  });

  it("runs generate then critique and returns critique survivors", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });
    const rewritten = validDraft({
      front: "What organelle produces ATP?",
      back: "The mitochondria",
    });

    const llm = mockPipelineLlm({
      generate: async () => [generated],
      complete: async ({ system, user }) => {
        expect(system.toLowerCase()).toMatch(/critique|keep|drop|rewrite/);
        expect(user).toContain("What produces ATP?");
        return JSON.stringify({ cards: [rewritten] });
      },
    });

    const drafts = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(llm.generateDrafts).toHaveBeenCalledTimes(1);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(drafts).toEqual([rewritten]);
  });

  it("critique drops ungrounded candidates", async () => {
    const grounded = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
      provenance: {
        pages: [1],
        excerpt: "The mitochondria produces ATP.",
      },
    });
    const ungrounded = validDraft({
      front: "What is the capital of Mars?",
      back: "Olympus Mons",
      provenance: {
        pages: [1],
        excerpt: "The mitochondria produces ATP.",
      },
    });

    const llm = mockPipelineLlm({
      generate: async () => [grounded, ungrounded],
      complete: async () =>
        // Critique keeps only the grounded card
        JSON.stringify({ cards: [grounded] }),
    });

    const drafts = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(drafts).toEqual([grounded]);
    expect(drafts.some((d) => d.front.includes("Mars"))).toBe(false);
  });

  it("falls back to schema-valid generate drafts when critique is unparseable after retry", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });

    const llm = mockPipelineLlm({
      generate: async () => [generated],
      complete: async () => "NOT JSON {{{",
    });

    const drafts = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    // 1 initial + 1 retry
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(drafts).toEqual([generated]);
  });

  it("falls back to generate drafts when critique returns empty after retry", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });

    const llm = mockPipelineLlm({
      generate: async () => [generated],
      complete: async () => JSON.stringify({ cards: [] }),
    });

    const drafts = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(drafts).toEqual([generated]);
  });
});

describe("remainderAfterRules", () => {
  it("strips harvested lines by provenance excerpt so caller can pipeline the rest", () => {
    const text = [
      "What is ATP :: Adenosine triphosphate",
      "The mitochondria produces ATP in eukaryotic cells.",
      "glycolysis - breakdown of glucose",
    ].join("\n");

    const rules = harvestRuleDrafts(text);
    expect(rules).toHaveLength(2);

    const remainder = remainderAfterRules(text, rules);
    expect(remainder).toContain("The mitochondria produces ATP");
    expect(remainder).not.toContain("What is ATP ::");
    expect(remainder).not.toContain("glycolysis - breakdown");
  });
});
