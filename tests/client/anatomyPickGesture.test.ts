import { describe, expect, it } from "vitest";
import {
  PICK_DRAG_THRESHOLD_PX,
  movementExceeded,
} from "../../src/anatomy/pickGesture";

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
