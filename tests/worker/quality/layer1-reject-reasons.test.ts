import { describe, expect, it } from "vitest";
import {
  filterDraftsByQuality,
  layer1RejectReasons,
} from "../../../worker/generation/quality";
import type { CardDraft } from "../../../worker/generation/schema";

function qa(front: string, back: string): CardDraft {
  return {
    type: "qa",
    front,
    back,
    provenance: { pages: [1], excerpt: front },
  };
}

describe("layer1RejectReasons", () => {
  it("names essay_back for over-long backs", () => {
    const essay = qa(
      "What is MHC class II presentation?",
      "Antigen-presenting cells process extracellular proteins into peptides that load onto MHC class II molecules in specialized compartments before traffic to the cell surface for CD4 T cell recognition during adaptive responses.",
    );
    expect(layer1RejectReasons(essay)).toContain("essay_back");
  });

  it("names compound_front for multi-fact stems", () => {
    const compound = qa(
      "What is MHC and what does it present?",
      "Peptide antigen",
    );
    expect(layer1RejectReasons(compound)).toContain("compound_front");
  });

  it("names incomplete_back for stub answers", () => {
    const stub = qa("What is the reservoir?", "see above");
    expect(layer1RejectReasons(stub)).toContain("incomplete_back");
  });

  it("rejects Ixodes free-path truncated debris (job 0f1e85dd)", () => {
    const hostRange = qa("Ixodinae Wide host range", "inc");
    const habitat = qa("Habitat", "Tropical and");
    const hyalomma = qa("Hyalomma spp", "Large inornate with banded");
    expect(layer1RejectReasons(hostRange)).toEqual(
      expect.arrayContaining(["incomplete_back"]),
    );
    expect(layer1RejectReasons(habitat)).toContain("incomplete_back");
    expect(filterDraftsByQuality([hostRange, habitat, hyalomma])).toEqual([]);
    // 4-word slide debris is not glossary-shaped → non_question_front.
    expect(layer1RejectReasons(hostRange)).toContain("non_question_front");
  });

  it("still keeps short real glossary pairs after Ixodes gates", () => {
    const mito = qa("mitochondria", "powerhouse of the cell");
    const paris = qa("Capital of France", "Paris");
    const peru = qa("Capital of Peru", "Lima");
    const ards = qa(
      "Acute Respiratory Distress Syndrome",
      "Severe inflammation of the lungs",
    );
    expect(layer1RejectReasons(mito)).toEqual([]);
    expect(layer1RejectReasons(paris)).toEqual([]);
    expect(layer1RejectReasons(peru)).toEqual([]);
    expect(layer1RejectReasons(ards)).toEqual([]);
    expect(filterDraftsByQuality([mito, paris, peru, ards])).toEqual([
      mito,
      paris,
      peru,
      ards,
    ]);
  });

  it("keeps Vitamin A and By imaging on questions", () => {
    const vitamin = qa("Which vitamin supports vision?", "Vitamin A");
    const imaging = qa("How is tuberculosis diagnosed?", "By imaging");
    expect(layer1RejectReasons(vitamin)).toEqual([]);
    expect(layer1RejectReasons(imaging)).toEqual([]);
    expect(filterDraftsByQuality([vitamin, imaging])).toEqual([
      vitamin,
      imaging,
    ]);
  });

  it("returns empty for a Layer-1-passing card", () => {
    const ok = qa("What is ATP?", "Adenosine triphosphate");
    expect(layer1RejectReasons(ok)).toEqual([]);
  });
});
