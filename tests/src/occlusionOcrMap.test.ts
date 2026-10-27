import { describe, expect, it } from "vitest";
import {
  MAX_REGIONS,
  MIN_AREA_FRACTION,
  MIN_CONFIDENCE,
  mapOcrWordsToRegions,
  type OcrWord,
} from "../../src/lib/occlusionOcrMap";

function word(
  partial: Partial<OcrWord> & Pick<OcrWord, "text" | "bbox">,
): OcrWord {
  return {
    confidence: 90,
    ...partial,
  };
}

describe("constants", () => {
  it("exports mapper caps from design lock", () => {
    expect(MAX_REGIONS).toBe(8);
    expect(MIN_AREA_FRACTION).toBe(0.0004);
    expect(MIN_CONFIDENCE).toBe(40);
  });
});

describe("mapOcrWordsToRegions", () => {
  const imageW = 1000;
  const imageH = 800;

  it("normalizes pixel bbox to 0–1 x, y, w, h with cleaned label", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "  Femur.  ",
          confidence: 85,
          bbox: { x0: 100, y0: 200, x1: 300, y1: 400 },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions).toEqual([
      {
        id: "r1",
        x: 0.1,
        y: 0.25,
        w: 0.2,
        h: 0.25,
        label: "Femur",
      },
    ]);
  });

  it("drops words below MIN_CONFIDENCE", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "keep",
          confidence: 40,
          bbox: { x0: 0, y0: 0, x1: 100, y1: 100 },
        }),
        word({
          text: "drop",
          confidence: 39.9,
          bbox: { x0: 0, y0: 0, x1: 100, y1: 100 },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions).toHaveLength(1);
    expect(regions[0]?.label).toBe("keep");
  });

  it("drops boxes smaller than MIN_AREA_FRACTION of the image", () => {
    const minSide = Math.ceil(Math.sqrt(MIN_AREA_FRACTION * imageW * imageH));
    const tooSmall = minSide - 1;
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "tiny",
          bbox: { x0: 0, y0: 0, x1: tooSmall, y1: tooSmall },
        }),
        word({
          text: "ok",
          bbox: { x0: 0, y0: 0, x1: minSide, y1: minSide },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions).toHaveLength(1);
    expect(regions[0]?.label).toBe("ok");
  });

  it("drops labels empty after trim and punctuation noise strip", () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const regions = mapOcrWordsToRegions(
      [
        word({ text: "   ", bbox: box }),
        word({ text: "...", bbox: box }),
        word({ text: "valid", bbox: box }),
      ],
      imageW,
      imageH,
    );

    expect(regions).toHaveLength(1);
    expect(regions[0]?.label).toBe("valid");
  });

  it("sorts survivors in reading order (top then left)", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "bottom",
          bbox: { x0: 0, y0: 500, x1: 100, y1: 600 },
        }),
        word({
          text: "top-right",
          bbox: { x0: 500, y0: 0, x1: 600, y1: 100 },
        }),
        word({
          text: "top-left",
          bbox: { x0: 0, y0: 0, x1: 100, y1: 100 },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions.map((r) => r.label)).toEqual([
      "top-left",
      "top-right",
      "bottom",
    ]);
    expect(regions.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("caps output at MAX_REGIONS", () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const words = Array.from({ length: 10 }, (_, i) =>
      word({
        text: `w${i}`,
        bbox: { ...box, y0: i * 110, y1: i * 110 + 100 },
      }),
    );

    const regions = mapOcrWordsToRegions(words, imageW, imageH);

    expect(regions).toHaveLength(MAX_REGIONS);
    expect(regions[0]?.id).toBe("r1");
    expect(regions[MAX_REGIONS - 1]?.id).toBe(`r${MAX_REGIONS}`);
  });

  it("clamps boxes that extend past the image edge", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "edge",
          bbox: { x0: 900, y0: 700, x1: 1100, y1: 900 },
        }),
      ],
      imageW,
      imageH,
    );

    const r = regions[0]!;
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it("returns empty array when nothing passes filters", () => {
    expect(mapOcrWordsToRegions([], imageW, imageH)).toEqual([]);
    expect(
      mapOcrWordsToRegions(
        [word({ text: "x", confidence: 10, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } })],
        imageW,
        imageH,
      ),
    ).toEqual([]);
  });
});
