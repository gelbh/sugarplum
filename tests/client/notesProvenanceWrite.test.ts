import { describe, expect, it } from "vitest";
import {
  clampNotesPage,
  pagesToPersistAfterNavigate,
  pagesToPersistAfterRescue,
  pagesToPersistAfterSearchHits,
} from "../../src/study/notes/notesProvenanceWrite";

describe("pagesToPersistAfterRescue", () => {
  const scanned = [
    { page: 1, text: "title slide" },
    { page: 4, text: "spleen filters the blood" },
  ];

  it("returns null when rescued equals claimed", () => {
    expect(
      pagesToPersistAfterRescue({
        claimed: 4,
        rescued: 4,
        excerpt: "spleen filters",
        scanned,
        scanComplete: true,
      }),
    ).toBeNull();
  });

  it("returns excerpt hits when rescue finds another page", () => {
    expect(
      pagesToPersistAfterRescue({
        claimed: 1,
        rescued: 4,
        excerpt: "spleen filters",
        scanned,
        scanComplete: true,
      }),
    ).toEqual([4]);
  });

  it("falls back to rescued page when scanned misses excerpt", () => {
    expect(
      pagesToPersistAfterRescue({
        claimed: 1,
        rescued: 7,
        excerpt: "not found",
        scanned,
        scanComplete: true,
      }),
    ).toEqual([7]);
  });

  it("persists only rescued page when the scan is incomplete", () => {
    expect(
      pagesToPersistAfterRescue({
        claimed: 1,
        rescued: 2,
        excerpt: "spleen filters",
        scanned: [
          { page: 1, text: "title" },
          { page: 2, text: "spleen filters" },
        ],
        scanComplete: false,
      }),
    ).toEqual([2]);
  });
});

describe("pagesToPersistAfterSearchHits", () => {
  it("returns null when rescued equals claimed", () => {
    expect(
      pagesToPersistAfterSearchHits({
        claimed: 4,
        rescued: 4,
        hitPages: [4],
      }),
    ).toBeNull();
  });

  it("returns sorted unique hit pages when rescue finds another page", () => {
    expect(
      pagesToPersistAfterSearchHits({
        claimed: 1,
        rescued: 4,
        hitPages: [4, 9, 4],
      }),
    ).toEqual([4, 9]);
  });

  it("falls back to rescued page when hit list is empty", () => {
    expect(
      pagesToPersistAfterSearchHits({
        claimed: 1,
        rescued: 7,
        hitPages: [],
      }),
    ).toEqual([7]);
  });
});

describe("pagesToPersistAfterNavigate", () => {
  it("returns null when display matches stored first page", () => {
    expect(
      pagesToPersistAfterNavigate({
        storedFirst: 3,
        displayPage: 3,
        excerpt: "x",
        pageTexts: [{ page: 3, text: "x" }],
      }),
    ).toBeNull();
  });

  it("returns hits when display is among excerpt pages", () => {
    expect(
      pagesToPersistAfterNavigate({
        storedFirst: 1,
        displayPage: 4,
        excerpt: "spleen",
        pageTexts: [
          { page: 1, text: "title" },
          { page: 4, text: "spleen filters" },
        ],
      }),
    ).toEqual([4]);
  });

  it("returns display page when user chose a non-hit page", () => {
    expect(
      pagesToPersistAfterNavigate({
        storedFirst: 4,
        displayPage: 2,
        excerpt: "spleen",
        pageTexts: [
          { page: 2, text: "unrelated" },
          { page: 4, text: "spleen filters" },
        ],
      }),
    ).toEqual([2]);
  });
});

describe("clampNotesPage", () => {
  it("clamps into range", () => {
    expect(clampNotesPage(0, 10)).toBe(1);
    expect(clampNotesPage(99, 10)).toBe(10);
    expect(clampNotesPage(5, 10)).toBe(5);
  });

  it("returns null for empty docs", () => {
    expect(clampNotesPage(1, 0)).toBeNull();
  });
});
