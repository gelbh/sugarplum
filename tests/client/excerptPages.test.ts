import { describe, expect, it } from "vitest";
import {
  normalizeExcerptText,
  pagesForExcerpt,
  resolveNotesDisplayPage,
  stampDraftProvenancePages,
} from "../../src/study/excerptPages";

describe("normalizeExcerptText", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeExcerptText("  a\n\tb  ")).toBe("a b");
  });
});

describe("pagesForExcerpt", () => {
  const pages = [
    { page: 1, text: "Title slide immunology overview" },
    { page: 3, text: "Complement cascade serum proteins" },
    { page: 4, text: "Complement cascade continues" },
  ];

  it("returns empty for empty excerpt", () => {
    expect(pagesForExcerpt("  ", pages)).toEqual([]);
  });

  it("returns the single matching page", () => {
    expect(pagesForExcerpt("Complement cascade serum", pages)).toEqual([3]);
  });

  it("returns sorted unique multi-page hits", () => {
    expect(pagesForExcerpt("Complement cascade", pages)).toEqual([3, 4]);
  });

  it("returns empty when no page contains the excerpt", () => {
    expect(pagesForExcerpt("mitochondria", pages)).toEqual([]);
  });
});

describe("resolveNotesDisplayPage", () => {
  const pages = [
    { page: 1, text: "Cover" },
    { page: 4, text: "spleen filters the blood" },
  ];

  it("keeps claimed when excerpt hits there", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: 1,
        excerpt: "Cover",
        pages,
      }),
    ).toBe(1);
  });

  it("moves to first hit when claimed misses", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: 1,
        excerpt: "spleen filters",
        pages,
      }),
    ).toBe(4);
  });

  it("keeps claimed when nothing matches", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: 1,
        excerpt: "absent fact",
        pages,
      }),
    ).toBe(1);
  });

  it("returns null when claimed is null", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: null,
        excerpt: "spleen",
        pages,
      }),
    ).toBeNull();
  });
});

describe("stampDraftProvenancePages", () => {
  const pageTexts = [
    { page: 1, text: "Overview" },
    { page: 3, text: "M cells in Peyer patches" },
  ];

  it("remaps pages when excerpt hits a later page", () => {
    const drafts = [
      {
        provenance: { pages: [1], excerpt: "M cells in Peyer" },
      },
    ];
    expect(
      stampDraftProvenancePages(drafts, pageTexts, [1, 2, 3])[0]?.provenance
        .pages,
    ).toEqual([3]);
  });

  it("keeps existing pages when excerpt misses", () => {
    const drafts = [
      {
        provenance: { pages: [3], excerpt: "not in window" },
      },
    ];
    expect(
      stampDraftProvenancePages(drafts, pageTexts, [1, 2])[0]?.provenance.pages,
    ).toEqual([3]);
  });

  it("falls back to pickedPages when excerpt misses and pages empty", () => {
    const drafts = [
      {
        provenance: { pages: [], excerpt: "not in window" },
      },
    ];
    expect(
      stampDraftProvenancePages(drafts, pageTexts, [2, 3])[0]?.provenance.pages,
    ).toEqual([2, 3]);
  });

  it("matches excerpt case-insensitively", () => {
    const drafts = [
      {
        provenance: { pages: [1], excerpt: "m cells in peyer" },
      },
    ];
    expect(
      stampDraftProvenancePages(drafts, pageTexts, [1])[0]?.provenance.pages,
    ).toEqual([3]);
  });
});
