/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applyStudySwipeFrame } from "../../src/study/useStudyCardGesture";
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
    expect(plate.style.transform).toBe("translate3d(48px, 0px, 0)");
    expect(stamp.hidden).toBe(false);
    expect(stamp.style.visibility).toBe("visible");
    expect(stamp.textContent).toBe(visual.stampLabel);
    expect(Number(stamp.style.opacity)).toBeCloseTo(visual.stampOpacity);
  });

  it("hides stamp when visual has no label", () => {
    const plate = document.createElement("div");
    const stamp = document.createElement("div");
    stamp.hidden = false;
    stamp.style.opacity = "1";
    stamp.style.visibility = "visible";
    stamp.textContent = "Good";
    const visual = studySwipeVisual({
      dx: 0,
      dy: 0,
      revealed: true,
      reduceMotion: false,
    });
    applyStudySwipeFrame(plate, stamp, visual);
    expect(stamp.hidden).toBe(true);
    expect(stamp.style.opacity).toBe("0");
    expect(stamp.style.visibility).toBe("hidden");
    expect(stamp.textContent).toBe("");
  });
});
