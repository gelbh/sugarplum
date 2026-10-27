import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flattenBlocksToWords,
  resetOcrWorkerForTests,
  suggestOcclusionRegions,
} from "../../src/lib/occlusionOcr";

const recognize = vi.fn();

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(async () => ({
    setParameters: vi.fn(async () => ({})),
    recognize,
  })),
  OEM: { LSTM_ONLY: 1 },
  PSM: { SPARSE_TEXT: "11" },
}));

describe("flattenBlocksToWords", () => {
  it("walks blocks → paragraphs → lines → words", () => {
    const words = flattenBlocksToWords([
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  {
                    text: "A",
                    confidence: 90,
                    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                  },
                  {
                    text: "  ",
                    confidence: 90,
                    bbox: { x0: 11, y0: 0, x1: 20, y1: 10 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(words).toHaveLength(1);
    expect(words[0]?.text).toBe("A");
  });
});

describe("suggestOcclusionRegions", () => {
  afterEach(async () => {
    resetOcrWorkerForTests();
    recognize.mockReset();
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockClear();
  });

  it("maps recognized words through the region mapper", async () => {
    recognize.mockResolvedValueOnce({
      data: {
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      {
                        text: "Liver",
                        confidence: 95,
                        bbox: { x0: 100, y0: 50, x1: 200, y1: 80 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const regions = await suggestOcclusionRegions("blob:mock", 1000, 500);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.label).toBe("Liver");
    expect(regions[0]?.id).toBe("r1");
    expect(recognize).toHaveBeenCalledWith("blob:mock", {}, { blocks: true });
  });

  it("reuses a single worker for consecutive calls", async () => {
    const { createWorker } = await import("tesseract.js");
    recognize.mockResolvedValue({ data: { blocks: [] } });

    await suggestOcclusionRegions("a", 100, 100);
    await suggestOcclusionRegions("b", 100, 100);

    expect(createWorker).toHaveBeenCalledTimes(1);
  });
});
