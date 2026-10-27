import { describe, expect, it } from "vitest";
import {
  hashCardId,
  occlusionRevealAnswer,
  pickOcclusionRegion,
} from "../../src/study/pickOcclusionRegion";

const regions = [
  { id: "r1", label: "aorta" },
  { id: "r2", label: "vena cava" },
  { id: "r3", label: "pulmonary" },
];

describe("occlusionRevealAnswer", () => {
  it("uses the picked region's label when back.answer disagrees", () => {
    const picked = pickOcclusionRegion("card-abc", regions);
    expect(picked).not.toBeNull();
    const fallback = "whole-card summary that is not the region";
    expect(occlusionRevealAnswer(picked, fallback)).toBe(picked!.label);
    expect(occlusionRevealAnswer(picked, fallback)).not.toBe(fallback);
  });

  it("falls back when label is missing or blank", () => {
    expect(occlusionRevealAnswer({ label: "" }, "fallback")).toBe("fallback");
    expect(occlusionRevealAnswer({ label: "   " }, "fallback")).toBe("fallback");
    expect(occlusionRevealAnswer(null, "fallback")).toBe("fallback");
  });
});

describe("pickOcclusionRegion", () => {
  it("returns null for empty regions", () => {
    expect(pickOcclusionRegion("card-1", [])).toBeNull();
  });

  it("returns the sole region when n === 1", () => {
    expect(pickOcclusionRegion("any", [regions[0]!])).toEqual(regions[0]);
  });

  it("is stable for the same cardId and regions", () => {
    const a = pickOcclusionRegion("card-abc", regions);
    const b = pickOcclusionRegion("card-abc", regions);
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it("indexes via hash(cardId) % n", () => {
    const id = "deck-card-42";
    const expected = regions[hashCardId(id) % regions.length];
    expect(pickOcclusionRegion(id, regions)).toEqual(expected);
  });

  it("can select different regions for different card ids", () => {
    const picks = new Set(
      ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"].map(
        (id) => pickOcclusionRegion(id, regions)?.id,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});
