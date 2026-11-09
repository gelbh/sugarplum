import { describe, expect, it } from "vitest";
import { cssFilterFromTraits } from "../../src/achievements/medalFilters";

describe("cssFilterFromTraits", () => {
  it("keeps a fixed locked filter", () => {
    expect(
      cssFilterFromTraits(
        { shine: "max", colour: "golden", status: "perfect" },
        { locked: true },
      ),
    ).toBe("brightness(0.55) saturate(0.35)");
  });

  it("makes legendary golden warmer than common dull", () => {
    const common = cssFilterFromTraits({
      shine: "low",
      colour: "dull",
      status: "bruised",
    });
    const legendary = cssFilterFromTraits({
      shine: "max",
      colour: "golden",
      status: "perfect",
    });
    expect(legendary).toMatch(/sepia\(|hue-rotate\(/);
    const commonB = Number(/brightness\(([\d.]+)\)/.exec(common)?.[1]);
    const legendB = Number(/brightness\(([\d.]+)\)/.exec(legendary)?.[1]);
    expect(legendB).toBeGreaterThan(commonB);
  });

  it("ignores unknown colour without throwing", () => {
    expect(() =>
      cssFilterFromTraits({
        shine: "mild",
        colour: "not-a-real-colour",
        status: "ripe",
      }),
    ).not.toThrow();
  });
});
