import { describe, expect, it } from "vitest";
import {
  occlusionMaskScrollTop,
  occlusionTileFocusTransform,
} from "../../src/deckHub/occlusionLayout";

describe("occlusionMaskScrollTop", () => {
  it("centers the mask in the shell and clamps to [0, max]", () => {
    const mask = { x: 0.1, y: 0.6, w: 0.2, h: 0.1 };
    expect(occlusionMaskScrollTop(mask, 1000, 200)).toBe(550);
    expect(occlusionMaskScrollTop(mask, 1000, 2000)).toBe(0);
    expect(
      occlusionMaskScrollTop({ x: 0, y: 0, w: 1, h: 0.05 }, 1000, 200),
    ).toBe(0);
  });
});

describe("occlusionTileFocusTransform", () => {
  it("scales to fit both axes, translates mask center, pins origin", () => {
    const mask = { x: 0.7, y: 0.1, w: 0.15, h: 0.1 };
    const t = occlusionTileFocusTransform(mask, { pad: 0.12, maxScale: 4 });
    expect(t.transformOrigin).toBe("77.5% 15%");
    expect(t.transform).toMatch(/^translate\(-27\.5%, 35%\) scale\(/);
    const scale = Number(/scale\(([^)]+)\)/.exec(t.transform)?.[1]);
    // min(1/0.39, 1/0.34) ≈ 2.564
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(2.6);
  });

  it("does not scale below 1 when mask already fills the tile", () => {
    const t = occlusionTileFocusTransform(
      { x: 0, y: 0, w: 1, h: 1 },
      { pad: 0.05 },
    );
    expect(t.transform).toBe("translate(0%, 0%) scale(1)");
  });

  it("uses the tighter axis so wide short masks are not over-scaled", () => {
    const t = occlusionTileFocusTransform(
      { x: 0, y: 0.45, w: 1, h: 0.1 },
      { pad: 0.12, maxScale: 4 },
    );
    const scale = Number(/scale\(([^)]+)\)/.exec(t.transform)?.[1]);
    // bw=1.24 → 1/bw < 1; bh=0.34 → ~2.94; min with max(1,…) → scale 1
    expect(scale).toBe(1);
  });
});
