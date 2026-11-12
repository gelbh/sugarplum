import { describe, expect, it } from "vitest";
import {
  formatSplitPartFilename,
  parseSplitPartFilename,
} from "../../src/lib/splitPartFilename";

describe("formatSplitPartFilename", () => {
  it("formats pdf and pptx product part names", () => {
    expect(
      formatSplitPartFilename({
        stem: "Lecture notes",
        index: 1,
        total: 3,
        ext: "pdf",
      }),
    ).toBe("Lecture notes (1/3).pdf");
    expect(
      formatSplitPartFilename({
        stem: "Deck",
        index: 2,
        total: 2,
        ext: "pptx",
      }),
    ).toBe("Deck (2/2).pptx");
  });
});

describe("parseSplitPartFilename", () => {
  it("parses product pdf and pptx part names", () => {
    expect(parseSplitPartFilename("Lecture notes (1/3).pdf")).toEqual({
      stem: "Lecture notes",
      index: 1,
      total: 3,
      ext: "pdf",
    });
    expect(parseSplitPartFilename("Deck (2/2).PPTX")).toEqual({
      stem: "Deck",
      index: 2,
      total: 2,
      ext: "pptx",
    });
  });

  it("rejects non-matching names", () => {
    expect(parseSplitPartFilename("notes.pdf")).toBeNull();
    expect(parseSplitPartFilename("notes (1).pdf")).toBeNull();
    expect(parseSplitPartFilename("notes (1/2).png")).toBeNull();
    expect(parseSplitPartFilename(null)).toBeNull();
    expect(parseSplitPartFilename("")).toBeNull();
  });
});

describe("format/parse round-trip", () => {
  it("parses what format emits", () => {
    const part = {
      stem: "Lecture notes",
      index: 1,
      total: 3,
      ext: "pdf" as const,
    };
    expect(parseSplitPartFilename(formatSplitPartFilename(part))).toEqual(part);
  });
});
