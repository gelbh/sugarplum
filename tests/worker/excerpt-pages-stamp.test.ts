import { describe, expect, it } from "vitest";
import { stampDraftProvenancePages } from "../../src/study/notes/excerptPages";

describe("stampDraftProvenancePages (worker generation)", () => {
  const pageTexts = [
    { page: 1, text: "Title" },
    { page: 3, text: "M cells in Peyer patches recognize pathogen" },
  ];

  it("remaps LLM default page 1 when excerpt lives on page 3", () => {
    const drafts = [
      {
        type: "qa" as const,
        front: "What do M cells do?",
        back: "Pathogen recognition",
        provenance: {
          pages: [1],
          excerpt: "M cells in Peyer patches",
        },
      },
    ];
    const stamped = stampDraftProvenancePages(drafts, pageTexts, [1, 2, 3]);
    expect(stamped[0]?.provenance.pages).toEqual([3]);
  });

  it("keeps existing page when excerpt misses extracted text", () => {
    const drafts = [
      {
        provenance: { pages: [3], excerpt: "hallucinated line" },
      },
    ];
    expect(
      stampDraftProvenancePages(drafts, pageTexts, [1, 2])[0]?.provenance.pages,
    ).toEqual([3]);
  });

  it("keeps [1] for plain single-page paste when that is the window", () => {
    const drafts = [
      {
        provenance: { pages: [1], excerpt: "paste fact" },
      },
    ];
    const pastePages = [{ page: 1, text: "paste fact here" }];
    expect(
      stampDraftProvenancePages(drafts, pastePages, [1])[0]?.provenance.pages,
    ).toEqual([1]);
  });
});
