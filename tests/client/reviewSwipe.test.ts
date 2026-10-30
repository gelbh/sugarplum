import { describe, expect, it } from "vitest";
import {
  REVIEW_SWIPE_THRESHOLD_PX,
  resolveReviewSwipe,
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
