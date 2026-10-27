import { describe, expect, it } from "vitest";
import { resolveCardGesture } from "../../src/study/cardGestures";

describe("resolveCardGesture", () => {
  it("returns none under threshold", () => {
    expect(
      resolveCardGesture({ revealed: false, dx: 10, dy: -10 }),
    ).toEqual({ type: "none" });
  });

  it("reveals on any direction past threshold when front", () => {
    expect(
      resolveCardGesture({ revealed: false, dx: 80, dy: 0 }),
    ).toEqual({ type: "reveal" });
    expect(
      resolveCardGesture({ revealed: false, dx: 0, dy: -80 }),
    ).toEqual({ type: "reveal" });
  });

  it("maps swipes to FSRS ratings when revealed", () => {
    expect(
      resolveCardGesture({ revealed: true, dx: -100, dy: 0 }),
    ).toEqual({ type: "grade", rating: 1 });
    expect(
      resolveCardGesture({ revealed: true, dx: 100, dy: 0 }),
    ).toEqual({ type: "grade", rating: 3 });
    expect(
      resolveCardGesture({ revealed: true, dx: 0, dy: 100 }),
    ).toEqual({ type: "grade", rating: 2 });
    expect(
      resolveCardGesture({ revealed: true, dx: 0, dy: -100 }),
    ).toEqual({ type: "grade", rating: 4 });
  });

  it("uses dominant axis when both move", () => {
    expect(
      resolveCardGesture({ revealed: true, dx: -90, dy: 20 }),
    ).toEqual({ type: "grade", rating: 1 });
  });
});
