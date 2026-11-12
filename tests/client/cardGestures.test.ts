import { describe, expect, it } from "vitest";
import {
  DRAG_SLOP_PX,
  SWIPE_THRESHOLD_PX,
  armGesture,
  gesturePassedSlop,
  resolveCardGesture,
} from "../../src/study/cardGestures";

describe("gesturePassedSlop", () => {
  it("is false under slop and true at/above", () => {
    expect(gesturePassedSlop({ dx: DRAG_SLOP_PX - 1, dy: 0 })).toBe(false);
    expect(gesturePassedSlop({ dx: DRAG_SLOP_PX, dy: 0 })).toBe(true);
    expect(gesturePassedSlop({ dx: 0, dy: DRAG_SLOP_PX })).toBe(true);
  });
});

describe("armGesture", () => {
  it("arms only after travel reaches slop", () => {
    expect(armGesture(false, 3, 2)).toBe(false);
    expect(armGesture(false, 10, 0)).toBe(true);
    expect(armGesture(true, 0, 0)).toBe(true);
  });

  it("does not arm from separate sub-slop samples on different axes", () => {
    const afterX = armGesture(false, 6, 0);
    expect(afterX).toBe(false);
    expect(armGesture(afterX, 0, 6)).toBe(false);
  });
});

describe("resolveCardGesture", () => {
  it("returns none under threshold", () => {
    expect(
      resolveCardGesture({ revealed: false, dx: 10, dy: -10 }),
    ).toEqual({ type: "none" });
  });

  it("defaults to 96px commit threshold", () => {
    expect(SWIPE_THRESHOLD_PX).toBe(96);
    expect(
      resolveCardGesture({ revealed: false, dx: 95, dy: 0 }),
    ).toEqual({ type: "none" });
    expect(
      resolveCardGesture({ revealed: false, dx: 96, dy: 0 }),
    ).toEqual({ type: "reveal" });
  });

  it("reveals on any direction past threshold when front", () => {
    expect(
      resolveCardGesture({ revealed: false, dx: 100, dy: 0 }),
    ).toEqual({ type: "reveal" });
    expect(
      resolveCardGesture({ revealed: false, dx: 0, dy: -100 }),
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
      resolveCardGesture({ revealed: true, dx: -100, dy: 20 }),
    ).toEqual({ type: "grade", rating: 1 });
  });
});
