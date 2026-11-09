import { describe, expect, it } from "vitest";
import {
  BOX_PADDING_PX,
  HORIZONTAL_MERGE_FACTOR,
  MAX_REGIONS,
  MIN_AREA_FRACTION,
  MIN_CONFIDENCE,
  VERTICAL_MERGE_FACTOR,
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
    expect(BOX_PADDING_PX).toBe(4);
    expect(HORIZONTAL_MERGE_FACTOR).toBe(1.5);
    expect(VERTICAL_MERGE_FACTOR).toBe(0.8);
  });
});

describe("mapOcrWordsToRegions", () => {
  const imageW = 1000;
  const imageH = 800;

  it("normalizes pixel bbox to 0–1 x, y, w, h with cleaned label and padding", () => {
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
        x: (100 - BOX_PADDING_PX) / imageW,
        y: (200 - BOX_PADDING_PX) / imageH,
        w: (200 + 2 * BOX_PADDING_PX) / imageW,
        h: (200 + 2 * BOX_PADDING_PX) / imageH,
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

  it("keeps alnum-adjacent +/- in labels (Na+, -5)", () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const regions = mapOcrWordsToRegions(
      [
        word({ text: "Na+", bbox: box }),
        word({
          text: "-5",
          bbox: { x0: 0, y0: 200, x1: 100, y1: 300 },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions.map((r) => r.label)).toEqual(["Na+", "-5"]);
  });

  it("merges adjacent words on the same line into one region", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "Superior",
          bbox: { x0: 100, y0: 100, x1: 200, y1: 140 },
        }),
        word({
          text: "vena",
          bbox: { x0: 210, y0: 102, x1: 280, y1: 138 },
        }),
        word({
          text: "cava",
          bbox: { x0: 290, y0: 100, x1: 360, y1: 140 },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions).toHaveLength(1);
    expect(regions[0]?.label).toBe("Superior vena cava");
    expect(regions[0]?.x).toBeCloseTo((100 - BOX_PADDING_PX) / imageW);
    expect(regions[0]?.w).toBeCloseTo((260 + 2 * BOX_PADDING_PX) / imageW);
  });

  it("vertically merges nearby lines into one multi-line label", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "Left",
          bbox: { x0: 100, y0: 100, x1: 160, y1: 130 },
        }),
        word({
          text: "atrium",
          bbox: { x0: 100, y0: 140, x1: 200, y1: 170 },
        }),
      ],
      imageW,
      imageH,
    );

    // Gap 10px; shorter height 30 → 0.8 * 30 = 24 → merge.
    expect(VERTICAL_MERGE_FACTOR * 30).toBeGreaterThanOrEqual(10);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.label).toBe("Left atrium");
    expect(regions[0]?.y).toBeCloseTo((100 - BOX_PADDING_PX) / imageH);
    expect(regions[0]?.h).toBeCloseTo((70 + 2 * BOX_PADDING_PX) / imageH);
  });

  it("does not vertically merge lines separated by a large gap", () => {
    const regions = mapOcrWordsToRegions(
      [
        word({
          text: "Top",
          bbox: { x0: 100, y0: 100, x1: 160, y1: 130 },
        }),
        word({
          text: "Bottom",
          bbox: { x0: 100, y0: 300, x1: 200, y1: 330 },
        }),
      ],
      imageW,
      imageH,
    );

    expect(regions.map((r) => r.label)).toEqual(["Top", "Bottom"]);
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
    const tallH = 4000;
    const words = Array.from({ length: 10 }, (_, i) =>
      word({
        text: `w${i}`,
        // Large gaps so lines do not vertically merge.
        bbox: { x0: 0, y0: i * 200, x1: 100, y1: i * 200 + 100 },
      }),
    );

    const regions = mapOcrWordsToRegions(words, imageW, tallH);

    expect(regions).toHaveLength(MAX_REGIONS);
    expect(regions[0]?.id).toBe("r1");
    expect(regions[MAX_REGIONS - 1]?.id).toBe(`r${MAX_REGIONS}`);
  });

  it("padding stays within image bounds", () => {
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
