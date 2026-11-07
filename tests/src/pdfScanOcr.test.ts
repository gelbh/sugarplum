import { describe, expect, it } from "vitest";
import {
  OCR_EMPTY_PAGE_LIMIT,
  OCR_PAGE_CHAR_CAP,
  capOcrPageText,
  ocrRefillWindow,
  refillLookbehindScanEnd,
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

describe("refillLookbehindScanEnd", () => {
  it("includes the last PDF page when startPage is past numPages", () => {
    expect(refillLookbehindScanEnd(41, 40)).toBe(40);
  });

  it("stops one page before startPage when the PDF is longer", () => {
    expect(refillLookbehindScanEnd(41, 100)).toBe(40);
  });

  it("caps lookbehind at OCR_REFILL_PAGE_MAX when startPage is past it", () => {
    expect(refillLookbehindScanEnd(2001, 50)).toBe(50);
  });

  it("returns a non-positive end when there are no pages to scan", () => {
    expect(refillLookbehindScanEnd(10, 0)).toBeLessThanOrEqual(0);
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
    expect(ocrRefillWindow(1)).toEqual({ start: 1, end: 120 });
    expect(ocrRefillWindow(50)).toEqual({ start: 50, end: 169 });
    expect(ocrRefillWindow(121)).toEqual({ start: 121, end: 240 });
    expect(ocrRefillWindow(2001)).toBeNull();
    expect(ocrRefillWindow(0)).toBeNull();
    expect(ocrRefillWindow(1.5)).toBeNull();
  });

  it("fills the forward window before earlier blanks", () => {
    const pages = [
      ...Array.from({ length: 8 }, (_, index) => ({
        page: index + 9,
        text: "",
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        page: index + 41,
        text: "",
      })),
    ];
    const selected = selectEmptyPagesInWindow(pages, {
      startPage: 41,
      covered: [1],
    });
    expect(selected.map((page) => page.page)).toEqual([
      41, 42, 43, 44, 45, 46, 47, 48,
    ]);
  });

  it("looks behind the resume cursor when the forward window is full of text", () => {
    const pages = [
      ...Array.from({ length: 12 }, (_, index) => ({
        page: index + 9,
        text: "",
      })),
      ...Array.from({ length: 40 }, (_, index) => ({
        page: index + 41,
        text: "has a text layer",
      })),
    ];
    const selected = selectEmptyPagesInWindow(pages, {
      startPage: 41,
      covered: [],
    });
    expect(selected.map((page) => page.page)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("selects an empty page past the upload scan limit", () => {
    const selected = selectEmptyPagesInWindow([{ page: 150, text: "" }], {
      startPage: 150,
      covered: [],
    });
    expect(selected.map((page) => page.page)).toEqual([150]);
  });

  it("drops pages past 2000 and still takes earlier blanks", () => {
    const selected = selectEmptyPagesInWindow(
      [
        { page: 10, text: "" },
        { page: 2001, text: "" },
      ],
      { startPage: 2001, covered: [] },
    );
    expect(selected.map((page) => page.page)).toEqual([10]);
  });
});
