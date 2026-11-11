import { beforeEach, describe, expect, it, vi } from "vitest";

const extractPdfPages = vi.fn();
const extractPdfPageNumbers = vi.fn();

vi.mock("../../worker/materials/extract-pdf", () => ({
  extractPdfPages: (...args: unknown[]) => extractPdfPages(...args),
  extractPdfPageNumbers: (...args: unknown[]) => extractPdfPageNumbers(...args),
}));

vi.mock("../../worker/materials/ocr-sidecar", async () => {
  const actual = await vi.importActual<
    typeof import("../../worker/materials/ocr-sidecar")
  >("../../worker/materials/ocr-sidecar");
  return {
    ...actual,
    writeOcrSidecar: vi.fn(async () => undefined),
  };
});

import { studyPdfWithOcrSidecar } from "../../worker/generation/pdf-ocr-study";

describe("studyPdfWithOcrSidecar buffer reuse", () => {
  beforeEach(() => {
    extractPdfPages.mockReset();
    extractPdfPageNumbers.mockReset();
    extractPdfPages.mockImplementation(async (_data: ArrayBuffer, start = 1) => ({
      pages: [
        {
          page: start,
          text: "Eimeria tenella infects the cecum and causes bloody diarrhea. Amprolium treats it.",
        },
      ],
      totalPages: 3,
      pageStart: start,
      pageEnd: start,
    }));
    extractPdfPageNumbers.mockResolvedValue([]);
  });

  it("passes the same ArrayBuffer to extract helpers (no slice copies)", async () => {
    const pdfBytes = new ArrayBuffer(64);
    await studyPdfWithOcrSidecar({
      env: {} as never,
      deckId: "deck-a",
      materialId: "mat-a",
      pdfBytes,
      startPage: 1,
      topicHints: [],
      usedKeys: [],
      sidecar: null,
    });

    expect(extractPdfPages).toHaveBeenCalled();
    for (const call of extractPdfPages.mock.calls) {
      expect(call[0]).toBe(pdfBytes);
    }
    for (const call of extractPdfPageNumbers.mock.calls) {
      expect(call[0]).toBe(pdfBytes);
    }
  });
});
