/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applyStudySwipeFrame } from "../../src/components/useStudyCardGesture";
import { studySwipeVisual } from "../../src/study/cardGestures";

describe("applyStudySwipeFrame", () => {
  it("writes transform and stamp chrome onto the plate", () => {
    const plate = document.createElement("div");
    const stamp = document.createElement("div");
    const visual = studySwipeVisual({
      dx: 48,
      dy: 0,
      revealed: true,
      reduceMotion: false,
    });
    applyStudySwipeFrame(plate, stamp, visual);
    expect(plate.style.transform).toBe(visual.transform);
    expect(stamp.hidden).toBe(false);
    expect(stamp.textContent).toBe(visual.stampLabel);
    expect(Number(stamp.style.opacity)).toBeCloseTo(visual.stampOpacity);
  });
});
