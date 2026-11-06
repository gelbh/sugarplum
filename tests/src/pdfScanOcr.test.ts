import { describe, expect, it } from "vitest";
import {
  OCR_EMPTY_PAGE_LIMIT,
  OCR_PAGE_CHAR_CAP,
  capOcrPageText,
  ocrRefillWindow,
  selectEmptyPages,
  selectEmptyPagesInWindow,
} from "../../src/lib/pdfScanOcr";

describe("selectEmptyPages", () => {
  it("keeps at most eight blanks and skips pages that already have text", () => {
    const pages = [
      { page: 2, text: "already extracted" },
      { page: 1, text: "   " },
      ...Array.from({ length: 10 }, (_, index) => ({
        page: index + 3,
        text: "",
      })),
      { page: 130, text: "" },
    ];
    const selected = selectEmptyPages(pages);
    expect(selected.map((page) => page.page)).toEqual([
      1,
      ...Array.from({ length: OCR_EMPTY_PAGE_LIMIT - 1 }, (_, index) => index + 3),
    ]);
    expect(selected.some((page) => page.page === 2 || page.page === 130)).toBe(
      false,
    );
  });
});

describe("capOcrPageText", () => {
  it("trims and stops at the page cap", () => {
    expect(capOcrPageText(`  ${"a".repeat(OCR_PAGE_CHAR_CAP + 5)}  `)).toHaveLength(
      OCR_PAGE_CHAR_CAP,
    );
  });
});

describe("selectEmptyPagesInWindow", () => {
  it("keeps eight blanks inside the resume window and skips covered pages", () => {
    const pages = [
      { page: 1, text: "" },
      { page: 4, text: "has a text layer" },
      { page: 5, text: "" },
      ...Array.from({ length: 10 }, (_, index) => ({
        page: index + 6,
        text: "",
      })),
      { page: 121, text: "" },
    ];
    const selected = selectEmptyPagesInWindow(pages, {
      startPage: 1,
      covered: [1],
    });
    expect(selected.map((page) => page.page)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(ocrRefillWindow(121)).toBeNull();
    expect(ocrRefillWindow(50)).toEqual({ start: 50, end: 120 });
  });
});
