import { describe, expect, it } from "vitest";
import {
  FADE_OTHERS_MAX,
  FADE_OTHERS_OPACITY,
  selectFadeIds,
} from "../../src/anatomy/fadeOthers";

describe("fadeOthers constants", () => {
  it("keeps opacity inside the spec band", () => {
    expect(FADE_OTHERS_OPACITY).toBeGreaterThanOrEqual(0.12);
    expect(FADE_OTHERS_OPACITY).toBeLessThanOrEqual(0.25);
  });

  it("caps at 64", () => {
    expect(FADE_OTHERS_MAX).toBe(64);
  });
});

describe("selectFadeIds", () => {
  it("returns all when under the cap", () => {
    expect(
      selectFadeIds([
        { id: "far", distanceSq: 100 },
        { id: "near", distanceSq: 1 },
      ]),
    ).toEqual(["near", "far"]);
  });

  it("keeps the nearest maxCount by distanceSq", () => {
    const candidates = Array.from({ length: 70 }, (_, i) => ({
      id: `s${i}`,
      distanceSq: 70 - i,
    }));
    const ids = selectFadeIds(candidates, 64);
    expect(ids).toHaveLength(64);
    expect(ids[0]).toBe("s69"); // distanceSq 1
    expect(ids[63]).toBe("s6"); // distanceSq 64
    expect(ids).not.toContain("s0"); // distanceSq 70, dropped
  });

  it("returns empty for empty input", () => {
    expect(selectFadeIds([])).toEqual([]);
  });
});
