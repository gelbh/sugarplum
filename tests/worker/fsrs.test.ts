import { describe, it, expect } from "vitest";
import { Rating, newCard, review } from "../../worker/study/fsrs";

describe("fsrs review", () => {
  it("good rating schedules later due", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const before = newCard(now);
    const after = review(before, Rating.Good, now);
    expect(after.due.getTime()).toBeGreaterThan(now.getTime());
  });
});
