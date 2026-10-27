import { describe, expect, it } from "vitest";
import { filterDraftsByQuality } from "../../worker/generation/quality";
import { harvestRuleDrafts } from "../../worker/generation/rules";
import type { CardDraft } from "../../worker/generation/schema";

function qa(front: string, back: string): CardDraft {
  return {
    type: "qa",
    front,
    back,
    provenance: { pages: [1], excerpt: front },
  };
}

describe("filterDraftsByQuality", () => {
  it("drops short fronts, table-header dumps, and multi-sentence backs", () => {
    const kept = qa("What is ATP?", "Adenosine triphosphate");
    const drafts = [
      qa("Phylum", "Hosts Family"),
      qa("ab", "too short front"),
      qa("What causes malaria?", "A. One. B. Two. C. Three."),
      kept,
    ];
    expect(filterDraftsByQuality(drafts)).toEqual([kept]);
  });

  it("keeps short glossary fronts that rules harvest", () => {
    const glossary = qa("mitochondria", "powerhouse of the cell");
    expect(filterDraftsByQuality([glossary])).toEqual([glossary]);
  });

  it("keeps very short non-question glossary fronts (≥3 chars)", () => {
    const dna = qa("DNA", "deoxyribonucleic acid");
    expect(filterDraftsByQuality([dna])).toEqual([dna]);
  });

  it("still drops non-glossary fronts shorter than 8 chars", () => {
    const shortQ = qa("What?", "too short question front");
    expect(filterDraftsByQuality([shortQ])).toEqual([]);
  });

  it("keeps rule-harvested glossary after Layer-1 (harvest→filter)", () => {
    const drafts = harvestRuleDrafts("mitochondria: powerhouse of the cell");
    expect(drafts.map((d) => d.front)).toEqual(["mitochondria"]);
    expect(filterDraftsByQuality(drafts).map((d) => d.front)).toEqual([
      "mitochondria",
    ]);
  });

  it("keeps a normal cloze", () => {
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    expect(filterDraftsByQuality([cloze])).toEqual([cloze]);
  });
});
