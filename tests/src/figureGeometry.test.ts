import { describe, expect, it } from "vitest";
import {
  FIGURE_LABELS,
  MAX_CLIENT_FIGURES,
  MAX_PAGES_TO_SCAN,
  MIN_BOX_AREA_FRACTION,
  MIN_BOX_SCORE,
  type PageBox,
  canvasSourceScale,
  clampBoxToPage,
  filterFigureBoxes,
} from "../../src/lib/figureGeometry";

function box(partial: Partial<PageBox> & Pick<PageBox, "score" | "label">): PageBox {
  return {
    pageIndex: 0,
    x: 10,
    y: 10,
    w: 100,
    h: 100,
    ...partial,
  };
}

describe("canvasSourceScale", () => {
  it("uses width / clientWidth (not a hardcoded DPR)", () => {
    expect(canvasSourceScale({ width: 1600, clientWidth: 800 })).toBe(2);
    expect(canvasSourceScale({ width: 1200, clientWidth: 400 })).toBe(3);
    expect(canvasSourceScale({ width: 800, clientWidth: 800 })).toBe(1);
  });
});

describe("constants", () => {
  it("exports figure filter thresholds and caps", () => {
    expect(FIGURE_LABELS).toEqual(
      new Set(["image", "chart", "header_image", "footer_image"]),
    );
    expect(MIN_BOX_SCORE).toBe(0.5);
    expect(MIN_BOX_AREA_FRACTION).toBe(0.01);
    expect(MAX_PAGES_TO_SCAN).toBe(15);
    expect(MAX_CLIENT_FIGURES).toBe(20);
  });
});

describe("filterFigureBoxes", () => {
  const pageW = 1000;
  const pageH = 1000;

  it("filters out low score, non-figure labels, and tiny area", () => {
    const boxes: PageBox[] = [
      box({ score: 0.9, label: "image", w: 200, h: 200 }),
      box({ score: 0.39, label: "image", w: 200, h: 200 }),
      box({ score: 0.9, label: "text", w: 200, h: 200 }),
      box({ score: 0.9, label: "chart", w: 50, h: 50 }),
      box({ score: 0.55, label: "footer_image", w: 100, h: 100 }),
      box({ score: 0.8, label: "picture", w: 200, h: 200 }),
      box({ score: 0.7, label: "header_image", w: 120, h: 120 }),
    ];

    const filtered = filterFigureBoxes(boxes, pageW, pageH);

    expect(filtered.map((b) => b.label)).toEqual([
      "image",
      "header_image",
      "footer_image",
    ]);
    expect(filtered.every((b) => b.score >= MIN_BOX_SCORE)).toBe(true);
    expect(
      filtered.every(
        (b) => (b.w * b.h) / (pageW * pageH) >= MIN_BOX_AREA_FRACTION,
      ),
    ).toBe(true);
  });

  it("preserves order by score desc and does not cap to MAX_CLIENT_FIGURES", () => {
    const boxes: PageBox[] = Array.from({ length: 25 }, (_, i) =>
      box({
        score: 0.5 + i * 0.01,
        label: "image",
        w: 200,
        h: 200,
        pageIndex: i,
      }),
    );

    const filtered = filterFigureBoxes(boxes, pageW, pageH);

    expect(filtered.length).toBe(25);
    expect(filtered.length).toBeGreaterThan(MAX_CLIENT_FIGURES);
    for (let i = 1; i < filtered.length; i++) {
      expect(filtered[i - 1]!.score).toBeGreaterThanOrEqual(filtered[i]!.score);
    }
  });
});

describe("clampBoxToPage", () => {
  it("keeps x+w and y+h inside the page", () => {
    const clamped = clampBoxToPage(
      box({ x: -20, y: -10, w: 500, h: 400, score: 0.9, label: "figure" }),
      300,
      200,
    );

    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(300);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(200);
    expect(clamped.w).toBeGreaterThan(0);
    expect(clamped.h).toBeGreaterThan(0);
  });

  it("clamps a box that overflows the bottom-right", () => {
    const clamped = clampBoxToPage(
      box({ x: 250, y: 180, w: 100, h: 50, score: 0.9, label: "figure" }),
      300,
      200,
    );

    expect(clamped.x + clamped.w).toBeLessThanOrEqual(300);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(200);
  });
});
