import { describe, expect, it, vi } from "vitest";
import {
  runGenerationPipeline,
  type PipelineLlm,
} from "../../worker/generation/pipeline";
import type { CardDraft } from "../../worker/generation/schema";
import { CardDraftSchema } from "../../worker/generation/schema";

const CHUNK = [
  "Lysozyme digests peptidoglycan in bacterial cell walls.",
  "ATP is the primary energy currency of the cell.",
].join(" ");

function validDraft(
  overrides: Partial<CardDraft> & Pick<CardDraft, "front" | "back">,
): CardDraft {
  return CardDraftSchema.parse({
    type: "qa",
    provenance: { pages: [1], excerpt: "excerpt" },
    ...overrides,
  });
}

const twoClaims = {
  claims: [
    {
      subject: "Lysozyme",
      predicate: "digests peptidoglycan in bacterial cell walls",
      object: "peptidoglycan",
      source_span: "Lysozyme digests peptidoglycan in bacterial cell walls",
    },
    {
      subject: "ATP",
      predicate: "is the primary energy currency of the cell",
      source_span: "ATP is the primary energy currency of the cell",
    },
  ],
};

const twoCards: CardDraft[] = [
  validDraft({
    front: "What does lysozyme digest?",
    back: "Peptidoglycan in bacterial cell walls",
    provenance: {
      pages: [1],
      excerpt: "Lysozyme digests peptidoglycan in bacterial cell walls",
    },
  }),
  validDraft({
    front: "What is ATP?",
    back: "Primary energy currency of the cell",
    provenance: {
      pages: [1],
      excerpt: "ATP is the primary energy currency of the cell",
    },
  }),
];

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function isCompoundFront(front: string): boolean {
  return /\band\s+(what|which|how|why)\b/i.test(front) || /\bversus\b|\bvs\.?\b/i.test(front);
}

describe("claim pipeline (extract → write → critique)", () => {
  it("runs extract then write then critique via complete; never generateDrafts", async () => {
    const completeCalls: Array<{
      system: string;
      user: string;
      jsonShape?: string;
    }> = [];
    const llm: PipelineLlm = {
      generateDrafts: vi.fn(async () => {
        throw new Error("generateDrafts must not be called for text claim path");
      }),
      complete: vi.fn(async ({ system, user, jsonShape }) => {
        completeCalls.push({ system, user, jsonShape });
        const s = system.toLowerCase();
        if (s.includes("extract") && s.includes("claim")) {
          return { text: JSON.stringify(twoClaims), usage: null };
        }
        if (s.includes("flashcard") || s.includes("study claim")) {
          return { text: JSON.stringify(twoCards), usage: null };
        }
        if (s.includes("critique")) {
          return { text: JSON.stringify({ cards: twoCards }), usage: null };
        }
        throw new Error(`unexpected system prompt sniff: ${system.slice(0, 80)}`);
      }),
    };

    const drafts = await runGenerationPipeline({
      text: CHUNK,
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalled();
    expect(completeCalls.length).toBeGreaterThanOrEqual(3);
    expect(completeCalls[0]!.system.toLowerCase()).toMatch(/extract/);
    expect(completeCalls[0]!.jsonShape).toBe("claims");
    expect(completeCalls[1]!.system.toLowerCase()).toMatch(/flashcard|claim/);
    expect(completeCalls[1]!.jsonShape ?? "cards").toBe("cards");
    expect(completeCalls[2]!.system.toLowerCase()).toMatch(/critique/);
    expect(completeCalls[2]!.jsonShape ?? "cards").toBe("cards");

    expect(drafts).toHaveLength(2);
    for (const d of drafts) {
      expect(isCompoundFront(d.front)).toBe(false);
      expect(wordCount(d.back)).toBeLessThanOrEqual(25);
    }
  });

  it("write stage compact-retries once on mid-JSON truncation", async () => {
    const writeSystems: string[] = [];
    const oneCard = twoCards[0]!;
    const llm: PipelineLlm = {
      generateDrafts: vi.fn(async () => {
        throw new Error("generateDrafts must not be called");
      }),
      complete: vi.fn(async ({ system }) => {
        const s = system.toLowerCase();
        if (s.includes("extract") && s.includes("claim")) {
          return { text: JSON.stringify(twoClaims), usage: null };
        }
        if (s.includes("critique")) {
          return { text: JSON.stringify({ cards: [oneCard] }), usage: null };
        }
        if (s.includes("write") && s.includes("study claim")) {
          writeSystems.push(system);
          if (writeSystems.length === 1) {
            return {
              text: '{"cards":[{"type":"qa","front":"What does lysozyme digest?","back":"Peptidoglycan',
              usage: null,
            };
          }
          return { text: JSON.stringify([oneCard]), usage: null };
        }
        throw new Error(`unexpected system: ${system.slice(0, 80)}`);
      }),
    };

    const drafts = await runGenerationPipeline({
      text: CHUNK,
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(writeSystems).toHaveLength(2);
    expect(writeSystems[1]!.toLowerCase()).toMatch(/3|15|fewer|short/);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
  });
});
