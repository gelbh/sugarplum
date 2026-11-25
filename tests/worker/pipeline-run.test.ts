import { describe, expect, it, vi } from "vitest";
import {
  CHUNK_CHAR_LIMIT,
  MAX_PIPELINE_CHUNKS,
  runGenerationPipeline,
  type PipelineLlm,
} from "../../worker/generation/pipeline";
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

function materialFromUser(user: string): string {
  const start = user.indexOf("--- MATERIAL ---");
  const end = user.indexOf("--- END ---");
  if (start >= 0 && end > start) {
    return user.slice(start + "--- MATERIAL ---".length, end).trim();
  }
  return user.trim();
}

function defaultClaim(material: string) {
  const span = material.slice(0, Math.min(60, material.length)) || "excerpt";
  return {
    subject: "Topic",
    predicate: "is stated in the material",
    source_span: span,
    pages: [1] as number[],
  };
}

function defaultWriteDraft(material: string): CardDraft {
  return validDraft({
    front: "What produces ATP?",
    back: "mitochondria",
    provenance: {
      pages: [1],
      excerpt: material.slice(0, 80) || "excerpt",
    },
  });
}

/**
 * Stub LLM for the claim pipeline: sniff system prompt for extract / write / critique.
 * `generateDrafts` must never be required for the text path.
 */
function mockPipelineLlm(opts: {
  claimsForMaterial?: (material: string) => ReturnType<typeof defaultClaim>[];
  writeDrafts?: (material: string, user: string) => CardDraft[];
  critique?: (args: {
    system: string;
    user: string;
  }) => string | { text: string; usage?: null };
}): PipelineLlm {
  return {
    generateDrafts: vi.fn(async () => {
      throw new Error("generateDrafts must not be called for text claim path");
    }),
    complete: vi.fn(async (args) => {
      const { system, user } = args;
      const s = system.toLowerCase();
      if (s.includes("extract") && s.includes("claim")) {
        const material = materialFromUser(user);
        const claims = opts.claimsForMaterial
          ? opts.claimsForMaterial(material)
          : [defaultClaim(material)];
        return { text: JSON.stringify({ claims }), usage: null };
      }
      if (s.includes("critique")) {
        if (opts.critique) {
          const out = await opts.critique(args);
          return typeof out === "string" ? { text: out, usage: null } : out;
        }
        return {
          text: JSON.stringify({
            cards: [
              validDraft({
                front: "What produces ATP?",
                back: "mitochondria",
              }),
            ],
          }),
          usage: null,
        };
      }
      // Card-from-claim write (or unknown): produce drafts.
      const material = materialFromUser(user);
      const drafts = opts.writeDrafts
        ? opts.writeDrafts(material, user)
        : [defaultWriteDraft(material || "excerpt")];
      return { text: JSON.stringify({ cards: drafts }), usage: null };
    }),
  };
}

function extractMaterials(llm: PipelineLlm): string[] {
  return vi
    .mocked(llm.complete)
    .mock.calls.map((c) => c[0] as { system: string; user: string })
    .filter(
      (c) =>
        c.system.toLowerCase().includes("extract") &&
        c.system.toLowerCase().includes("claim"),
    )
    .map((c) => materialFromUser(c.user));
}

function writeUsers(llm: PipelineLlm): string[] {
  return vi
    .mocked(llm.complete)
    .mock.calls.map((c) => c[0] as { system: string; user: string })
    .filter((c) => {
      const s = c.system.toLowerCase();
      return (
        (s.includes("flashcard") || s.includes("study claim")) &&
        !s.includes("critique") &&
        !(s.includes("extract") && s.includes("claim"))
      );
    })
    .map((c) => c.user);
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
    expect(empty).toEqual({
      drafts: [],
      claims: [],
      claim_gap_extract_passes: 0,
      claim_span_gaps: [],
    });
    expect(ws).toEqual({
      drafts: [],
      claims: [],
      claim_gap_extract_passes: 0,
      claim_span_gaps: [],
    });
    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("chunks long text under the hard cap and processes sequentially", async () => {
    const llm = mockPipelineLlm({});

    // Prefer paragraph breaks: two ~3.5k blocks → two chunks under 6k.
    const block = "x".repeat(3500);
    const text = `${block}\n\n${block}`;
    expect(text.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);

    const { drafts } = await runGenerationPipeline({
      text,
      llm,
      apiKey: "k",
      provider: "mock",
    });

    const seenChunks = extractMaterials(llm);
    expect(seenChunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of seenChunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_CHAR_LIMIT);
    }
    expect(llm.generateDrafts).not.toHaveBeenCalled();
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
    const llm = mockPipelineLlm({});

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
    // Per chunk: claims extract, generate write, critique start/done; half-steps never rewind
    expect(events.map((e) => [e.stage, e.current, e.halfStepsDone])).toEqual([
      ["claims", 1, 0],
      ["generate", 1, 1],
      ["critique", 1, 1],
      ["critique", 1, 2],
      ["claims", 2, 2],
      ["generate", 2, 3],
      ["critique", 2, 3],
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

  it("advances critique half-steps when extract returns empty", async () => {
    const events: Array<{ stage: string; halfStepsDone: number }> = [];
    const llm = mockPipelineLlm({
      claimsForMaterial: () => [],
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
      ["claims", 0],
      ["generate", 1],
      ["critique", 1],
      ["critique", 2],
    ]);
    // Main extract + one claim gap pass; no write/critique.
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(llm.generateDrafts).not.toHaveBeenCalled();
  });

  it("caps extract complete calls at MAX_PIPELINE_CHUNKS", async () => {
    // Distinct claim text per chunk so fuzzy/exact dedupe does not skip write.
    // source_span uses the full material line so claim-span ledger needs no gap pass.
    const llm = mockPipelineLlm({
      claimsForMaterial: (material) => {
        const tag = material.match(/unique-(\d+)/)?.[1] ?? "0";
        return [
          {
            subject: `Mitochondria${tag}`,
            predicate: `produces energy form ${tag}`,
            object: `ATP${tag}`,
            source_span: material.trim(),
            pages: [1],
          },
        ];
      },
    });

    // 6 paragraph blocks → would be 6 chunks without the cap.
    const text = Array.from({ length: 6 }, (_, i) => {
      const pad = "y".repeat(CHUNK_CHAR_LIMIT - 20);
      return `${pad} unique-${i}`;
    }).join("\n\n");

    await runGenerationPipeline({
      text,
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(extractMaterials(llm)).toHaveLength(MAX_PIPELINE_CHUNKS);
    // extract + write + critique per chunk (no gap pass when spans cover lines)
    expect(llm.complete).toHaveBeenCalledTimes(MAX_PIPELINE_CHUNKS * 3);
    expect(llm.generateDrafts).not.toHaveBeenCalled();
  });

  it("tells later chunks which fronts are already covered", async () => {
    const llm = mockPipelineLlm({
      claimsForMaterial: (material) => {
        const tag = material.includes("chunk-b") ? "beta" : "alpha";
        return [
          {
            subject: `Organelle${tag}`,
            predicate: `produces fuel ${tag}`,
            object: `molecule${tag}`,
            source_span: material.slice(0, 60),
            pages: [1],
          },
        ];
      },
      writeDrafts: () => [
        validDraft({
          front: "What produces ATP?",
          back: "mitochondria",
          provenance: { pages: [1], excerpt: "e" },
        }),
      ],
      critique: async () =>
        JSON.stringify({
          cards: [
            validDraft({
              front: "What produces ATP?",
              back: "mitochondria",
              provenance: { pages: [1], excerpt: "e" },
            }),
          ],
        }),
    });
    const a = `${"a".repeat(CHUNK_CHAR_LIMIT - 20)} chunk-a`;
    const b = `${"b".repeat(CHUNK_CHAR_LIMIT - 20)} chunk-b`;
    const text = `${a}\n\n${b}`;
    await runGenerationPipeline({
      text,
      llm,
      apiKey: "k",
      provider: "mock",
      avoidFronts: ["Existing host of Eimeria tenella?"],
    });
    const users = writeUsers(llm);
    expect(users[0]).toContain("Eimeria tenella");
    expect(users[1]).toContain("What produces ATP?");
  });

  it("runs extract then write then critique and returns critique survivors", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });
    const rewritten = validDraft({
      front: "What organelle produces ATP?",
      back: "The mitochondria",
    });

    const llm = mockPipelineLlm({
      writeDrafts: () => [generated],
      critique: async ({ system, user }) => {
        expect(system.toLowerCase()).toMatch(/critique|keep|drop|rewrite/);
        expect(user).toContain("What produces ATP?");
        return JSON.stringify({ cards: [rewritten] });
      },
    });

    const { drafts } = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalledTimes(3);
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
      writeDrafts: () => [grounded, ungrounded],
      critique: async () =>
        // Critique keeps only the grounded card
        JSON.stringify({ cards: [grounded] }),
    });

    const { drafts } = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(drafts).toEqual([grounded]);
    expect(drafts.some((d) => d.front.includes("Mars"))).toBe(false);
  });

  it("falls back to schema-valid write drafts when critique is unparseable after retry", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });

    const llm = mockPipelineLlm({
      writeDrafts: () => [generated],
      critique: async () => "NOT JSON {{{",
    });

    const { drafts } = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    // extract + write + critique initial + critique retry
    expect(llm.complete).toHaveBeenCalledTimes(4);
    expect(drafts).toEqual([generated]);
  });

  it("salvages complete critique cards when JSON truncates mid-array", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });
    const survivor = validDraft({
      front: "What organelle produces ATP?",
      back: "The mitochondria",
    });
    const truncated =
      '{"cards":[' +
      JSON.stringify(survivor) +
      ',{"type":"qa","front":"What is the capital of';

    const llm = mockPipelineLlm({
      writeDrafts: () => [generated],
      critique: async () => truncated,
    });

    const { drafts } = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    // extract + write + one critique (salvage succeeds)
    expect(llm.complete).toHaveBeenCalledTimes(3);
    expect(drafts).toEqual([survivor]);
  });

  it("falls back to write drafts when critique returns empty after retry", async () => {
    const generated = validDraft({
      front: "What produces ATP?",
      back: "mitochondria",
    });

    const llm = mockPipelineLlm({
      writeDrafts: () => [generated],
      critique: async () => JSON.stringify({ cards: [] }),
    });

    const { drafts } = await runGenerationPipeline({
      text: "The mitochondria produces ATP.",
      llm,
      apiKey: "k",
      provider: "mock",
    });

    // extract + write + critique + critique retry
    expect(llm.complete).toHaveBeenCalledTimes(4);
    expect(drafts).toEqual([generated]);
  });
});
