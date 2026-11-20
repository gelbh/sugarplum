import { describe, expect, it } from "vitest";
import {
  PICK_DRAG_THRESHOLD_PX,
  PICK_DRAG_THRESHOLD_TOUCH_PX,
  movementExceeded,
  pickThresholdForPointerType,
  shouldCommitPick,
} from "../../src/anatomy/viewer/pickGesture";

describe("movementExceeded", () => {
  it("is false at exactly the threshold", () => {
    expect(movementExceeded(PICK_DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(movementExceeded(0, PICK_DRAG_THRESHOLD_PX)).toBe(false);
  });

  it("is false under the threshold", () => {
    expect(movementExceeded(3, 0)).toBe(false);
    expect(movementExceeded(2, 2)).toBe(false);
  });

  it("is true just over the threshold", () => {
    expect(movementExceeded(PICK_DRAG_THRESHOLD_PX + 0.1, 0)).toBe(true);
    expect(movementExceeded(3, 3)).toBe(true);
  });
});

describe("shouldCommitPick", () => {
  it("accepts a still tap", () => {
    expect(
      shouldCommitPick({
        exceededDuring: false,
        multiPointer: false,
        endDx: 0,
        endDy: 0,
      }),
    ).toBe(true);
  });

  it("rejects when movement exceeded mid-gesture even if end is near start", () => {
    expect(
      shouldCommitPick({
        exceededDuring: true,
        multiPointer: false,
        endDx: 1,
        endDy: 0,
      }),
    ).toBe(false);
  });

  it("rejects multi-pointer gestures", () => {
    expect(
      shouldCommitPick({
        exceededDuring: false,
        multiPointer: true,
        endDx: 0,
        endDy: 0,
      }),
    ).toBe(false);
  });

  it("allows touch slop under the touch threshold", () => {
    expect(
      shouldCommitPick({
        exceededDuring: false,
        multiPointer: false,
        endDx: 8,
        endDy: 0,
        thresholdPx: PICK_DRAG_THRESHOLD_TOUCH_PX,
      }),
    ).toBe(true);
  });
});

describe("pickThresholdForPointerType", () => {
  it("uses a tighter threshold for mouse", () => {
    expect(pickThresholdForPointerType("mouse")).toBe(PICK_DRAG_THRESHOLD_PX);
    expect(pickThresholdForPointerType("touch")).toBe(
      PICK_DRAG_THRESHOLD_TOUCH_PX,
    );
  });
});
