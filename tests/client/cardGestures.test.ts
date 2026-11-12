import { describe, expect, it } from "vitest";
import {
  DRAG_SLOP_PX,
  SWIPE_THRESHOLD_PX,
  armGesture,
  gesturePassedSlop,
  resolveCardGesture,
  studyPointerAllowed,
  studySwipeVisual,
} from "../../src/study/cardGestures";
import { GRADE_LABELS } from "../../src/study/gradeLabels";

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
      resolveCardGesture({ revealed: true, dx: 95, dy: 0 }),
    ).toEqual({ type: "none" });
    expect(
      resolveCardGesture({ revealed: true, dx: 96, dy: 0 }),
    ).toEqual({ type: "grade", rating: 3 });
  });

  it("does not reveal from swipe when front is showing", () => {
    expect(
      resolveCardGesture({ revealed: false, dx: 100, dy: 0 }),
    ).toEqual({ type: "none" });
    expect(
      resolveCardGesture({ revealed: false, dx: 0, dy: -100 }),
    ).toEqual({ type: "none" });
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

describe("studySwipeVisual", () => {
  const motion = { reduceMotion: false };

  it("hides the stamp under slop", () => {
    expect(
      studySwipeVisual({ dx: 3, dy: 2, revealed: true, ...motion }),
    ).toMatchObject({ stampLabel: null, stampOpacity: 0 });
  });

  it("keeps stamp idle when not revealed past slop", () => {
    expect(
      studySwipeVisual({
        dx: 48,
        dy: 0,
        revealed: false,
        reduceMotion: false,
      }),
    ).toMatchObject({ stampLabel: null, stampOpacity: 0 });
  });

  it("tracks with translate3d and no rotate when revealed", () => {
    const v = studySwipeVisual({
      dx: 40,
      dy: -20,
      revealed: true,
      reduceMotion: false,
    });
    expect(v.transform).toBe("translate3d(40px, -20px, 0)");
    expect(v.transform).not.toMatch(/rotate/);
  });

  it("maps dominant directions to grade labels when revealed", () => {
    expect(
      studySwipeVisual({ dx: -48, dy: 0, revealed: true, ...motion }).stampLabel,
    ).toBe(GRADE_LABELS[1]);
    expect(
      studySwipeVisual({ dx: 0, dy: 48, revealed: true, ...motion }).stampLabel,
    ).toBe(GRADE_LABELS[2]);
    expect(
      studySwipeVisual({ dx: 48, dy: 0, revealed: true, ...motion }).stampLabel,
    ).toBe(GRADE_LABELS[3]);
    expect(
      studySwipeVisual({ dx: 0, dy: -48, revealed: true, ...motion }).stampLabel,
    ).toBe(GRADE_LABELS[4]);
  });

  it("ramps opacity to 1 at the commit threshold", () => {
    expect(
      studySwipeVisual({
        dx: SWIPE_THRESHOLD_PX,
        dy: 0,
        revealed: true,
        ...motion,
      }).stampOpacity,
    ).toBe(1);
  });

  it("uses translate3d under reduced motion too", () => {
    expect(
      studySwipeVisual({
        dx: 40,
        dy: 12,
        revealed: true,
        reduceMotion: true,
      }).transform,
    ).toBe("translate3d(40px, 12px, 0)");
  });
});

describe("studyPointerAllowed", () => {
  it("blocks when notes/busy gate is on or target is outside the host", () => {
    expect(
      studyPointerAllowed({ blocked: true, targetInHost: true }),
    ).toBe(false);
    expect(
      studyPointerAllowed({ blocked: false, targetInHost: false }),
    ).toBe(false);
    expect(
      studyPointerAllowed({ blocked: false, targetInHost: true }),
    ).toBe(true);
  });
});
