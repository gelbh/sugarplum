import { describe, expect, it } from "vitest";
import { resolveNotesDisplayPage } from "../../../../src/study/notes/excerptPages";

describe("Notes page rescue", () => {
  const pages = [
    { page: 1, text: "IM1 Overview title slide" },
    { page: 4, text: "spleen filters the blood major function" },
  ];

  it("opens the page that contains the excerpt when claimed page 1 misses", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: 1,
        excerpt: "spleen filters the blood",
        pages,
      }),
    ).toBe(4);
  });

  it("stays on claimed when the wash would already hit", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: 4,
        excerpt: "spleen filters",
        pages,
      }),
    ).toBe(4);
  });

  it("stays on claimed when the excerpt is absent from the PDF text", () => {
    expect(
      resolveNotesDisplayPage({
        claimed: 1,
        excerpt: "not in this file",
        pages,
      }),
    ).toBe(1);
  });
});
