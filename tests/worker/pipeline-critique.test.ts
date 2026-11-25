import { describe, expect, it, vi } from "vitest";
import {
  CHUNK_CHAR_LIMIT,
  critiqueDraftsAgainstSource,
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

describe("critiqueDraftsAgainstSource", () => {
  it("passes unmatched excerpts through without forcing them into chunk 0", async () => {
    // Two chunks so bucketing runs; unmatched must not enter either critique call.
    // Put markers at the start so slice(CHUNK_CHAR_LIMIT) cannot cut them off.
    const chunkA = `marker-a ${"alpha ".repeat(900)}`.slice(0, CHUNK_CHAR_LIMIT);
    const chunkB = `marker-b ${"beta ".repeat(900)}`.slice(0, CHUNK_CHAR_LIMIT);
    const sourceText = `${chunkA}\n\n${chunkB}`;
    expect(sourceText.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);

    const matched = validDraft({
      front: "What is marker-a?",
      back: "alpha region",
      provenance: { pages: [1], excerpt: "marker-a" },
    });
    const orphan = validDraft({
      front: "What is orphan?",
      back: "not in any chunk",
      provenance: { pages: [1], excerpt: "orphan-excerpt-xyz" },
    });

    const llm = mockPipelineLlm({
      // Keep matched; empty would fall back to the whole bucket.
      critique: async () => JSON.stringify({ cards: [matched] }),
    });
    const survivors = await critiqueDraftsAgainstSource({
      sourceText,
      candidates: [matched, orphan],
      llm,
      apiKey: "k",
      provider: "mock",
    });

    expect(survivors).toEqual([orphan, matched]);
    expect(llm.complete).toHaveBeenCalled();
    for (const call of llm.complete.mock.calls) {
      const user = (call[0] as { user: string }).user;
      expect(user).not.toContain("orphan-excerpt-xyz");
      expect(user).not.toContain("What is orphan?");
    }
  });

  it("critiques candidates and falls back to them when complete hard-fails", async () => {
    const kept = validDraft({
      front: "mitochondria",
      back: "powerhouse of the cell",
      provenance: {
        pages: [1],
        excerpt: "mitochondria: powerhouse of the cell",
      },
    });
    const dropped = validDraft({
      front: "Overview",
      back: "general summary of chapter",
      provenance: {
        pages: [1],
        excerpt: "Overview: general summary of chapter",
      },
    });

    const dropLlm = mockPipelineLlm({
      critique: async () => JSON.stringify({ cards: [kept] }),
    });
    const survivors = await critiqueDraftsAgainstSource({
      sourceText: "mitochondria: powerhouse of the cell\nOverview: general summary of chapter",
      candidates: [kept, dropped],
      llm: dropLlm,
      apiKey: "k",
      provider: "mock",
    });
    expect(survivors).toEqual([kept]);
    expect(dropLlm.complete).toHaveBeenCalledTimes(1);

    const failLlm = mockPipelineLlm({
      critique: async () => "NOT JSON {{{",
    });
    const fallback = await critiqueDraftsAgainstSource({
      sourceText: "mitochondria: powerhouse of the cell",
      candidates: [kept, dropped],
      llm: failLlm,
      apiKey: "k",
      provider: "mock",
    });
    expect(failLlm.complete).toHaveBeenCalledTimes(2);
    expect(fallback).toEqual([kept, dropped]);
  });
});
