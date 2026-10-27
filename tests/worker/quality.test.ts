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

  it("keeps questions that end with a table-column word", () => {
    const hostQ = qa("What is the definitive host?", "Dogs and cats");
    expect(filterDraftsByQuality([hostQ])).toEqual([hostQ]);
  });

  it("drops lecture-table junk from real harvest (0c24a8cf)", () => {
    const mito = qa("mitochondria", "powerhouse of the cell");
    const atp = qa("What is ATP?", "Adenosine triphosphate");
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    const junk = [
      qa("Entamoebidae Definitive", "Multiple"),
      qa("to large intestine", "passed in faeces"),
      qa("Eimeriidae Definitive", "depends on"),
      qa("Cats", "Chronic"),
      qa("comb", "\u201DBlackhead\u201D."),
    ];
    expect(filterDraftsByQuality([...junk, mito, atp, cloze])).toEqual([
      mito,
      atp,
      cloze,
    ]);
  });

  it("keeps QA backs with typographic apostrophe contractions", () => {
    const dna = qa(
      "What is DNA?",
      "Deoxyribonucleic acid. It\u2019s genetic.",
    );
    expect(filterDraftsByQuality([dna])).toEqual([dna]);
  });

  it("keeps question fronts that start with a preposition", () => {
    const organelle = qa(
      "In which organelle does glycolysis occur?",
      "Cytoplasm",
    );
    const atp = qa("what is ATP?", "Adenosine triphosphate");
    expect(filterDraftsByQuality([organelle, atp])).toEqual([organelle, atp]);
  });

  it("keeps glossary/pipe pairs with a one-word back", () => {
    const harvested = harvestRuleDrafts("Capital of France | Paris\n");
    expect(harvested.map((d) => d.front)).toEqual(["Capital of France"]);
    expect(filterDraftsByQuality(harvested).map((d) => d.back)).toEqual([
      "Paris",
    ]);
  });

  it("keeps yes/no answers only when the front is a question", () => {
    const yesQ = qa("Is ATP a nucleotide?", "yes");
    const yesJunk = qa("ATP present", "yes");
    expect(filterDraftsByQuality([yesQ, yesJunk])).toEqual([yesQ]);
  });

  it("drops residual regen leftovers: section headers, thin glossary, tautology", () => {
    const mito = qa("mitochondria", "powerhouse of the cell");
    const atp = qa("What is ATP?", "Adenosine triphosphate");
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    const residual = [
      qa("Pathogenesis in cattle", "Females affected: abortion."),
      qa("Endometriosis", "Inflammation."),
      qa(
        "What is the significance of Trichomonas in free-range flocks?",
        "Especially in free-range flocks.",
      ),
    ];
    expect(filterDraftsByQuality([...residual, mito, atp, cloze])).toEqual([
      mito,
      atp,
      cloze,
    ]);
  });
});
