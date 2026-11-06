/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applyReviewSwipeFrame } from "../../src/components/useReviewSwipe";
import {
  REVIEW_SWIPE_THRESHOLD_PX,
  resolveReviewSwipe,
  reviewSwipeVisual,
} from "../../src/study/cardGestures";

describe("resolveReviewSwipe", () => {
  it("accepts a right swipe past the threshold", () => {
    expect(resolveReviewSwipe({ dx: 120, dy: 10 })).toBe("accept");
  });

  it("rejects a left swipe past the threshold", () => {
    expect(resolveReviewSwipe({ dx: -120, dy: 10 })).toBe("reject");
  });

  it("commits exactly at the threshold", () => {
    expect(resolveReviewSwipe({ dx: REVIEW_SWIPE_THRESHOLD_PX, dy: 0 })).toBe(
      "accept",
    );
  });

  it("ignores a short swipe", () => {
    expect(
      resolveReviewSwipe({ dx: REVIEW_SWIPE_THRESHOLD_PX - 1, dy: 0 }),
    ).toBe("none");
  });

  it("ignores a mostly vertical drag", () => {
    expect(resolveReviewSwipe({ dx: 120, dy: 140 })).toBe("none");
  });
});

describe("reviewSwipeVisual", () => {
  const motion = { leaving: null, reduceMotion: false } as const;

  it("is centered with no stamp when idle", () => {
    expect(reviewSwipeVisual({ dx: 0, ...motion })).toEqual({
      transform: "translateX(0px) rotate(0deg)",
      stamp: null,
      stampOpacity: 0,
      dimmed: false,
    });
  });

  it("tilts and fades in the accept stamp while dragging right", () => {
    expect(reviewSwipeVisual({ dx: 48, ...motion })).toEqual({
      transform: "translateX(48px) rotate(2.4deg)",
      stamp: "accept",
      stampOpacity: 0.5,
      dimmed: false,
    });
  });

  it("shows the reject stamp once a left drag passes the slop", () => {
    expect(reviewSwipeVisual({ dx: -8, ...motion }).stamp).toBe("reject");
    expect(reviewSwipeVisual({ dx: -7, ...motion }).stamp).toBeNull();
  });

  it("caps the stamp opacity past the threshold", () => {
    expect(reviewSwipeVisual({ dx: 300, ...motion }).stampOpacity).toBe(1);
  });

  it("flies off with a full stamp when leaving", () => {
    expect(
      reviewSwipeVisual({ dx: 40, leaving: "accept", reduceMotion: false }),
    ).toEqual({
      transform: "translateX(150%) rotate(18deg)",
      stamp: "accept",
      stampOpacity: 1,
      dimmed: false,
    });
    expect(
      reviewSwipeVisual({ dx: 0, leaving: "reject", reduceMotion: false })
        .transform,
    ).toBe("translateX(-150%) rotate(-18deg)");
  });

  it("writes transform and stamp opacity onto the plate", () => {
    const plate = document.createElement("div");
    const stamp = document.createElement("div");
    const visual = reviewSwipeVisual({
      dx: 48,
      leaving: null,
      reduceMotion: false,
    });
    applyReviewSwipeFrame(plate, stamp, visual);
    expect(plate.style.transform).toBe(visual.transform);
    expect(stamp.style.opacity).toBe(String(visual.stampOpacity));
    expect(stamp.textContent).toBe("Accept");
  });

  it("drops rotation and fly-off under reduced motion and dims when leaving", () => {
    expect(
      reviewSwipeVisual({ dx: 48, leaving: null, reduceMotion: true }),
    ).toMatchObject({ transform: "translateX(48px)", dimmed: false });
    expect(
      reviewSwipeVisual({ dx: 0, leaving: "reject", reduceMotion: true }),
    ).toEqual({
      transform: "translateX(0px)",
      stamp: "reject",
      stampOpacity: 1,
      dimmed: true,
    });
  });
});
