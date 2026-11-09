import { describe, it, expect } from "vitest";
import { Rating, newCard, review } from "../../worker/study/fsrs";

describe("fsrs review", () => {
  it("good rating schedules later due", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const before = newCard(now);
    const after = review(before, Rating.Good, now);
    expect(after.due.getTime()).toBeGreaterThan(now.getTime());
  });

  it("higher desiredRetention schedules a sooner due with fuzz off", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const graduated = review(newCard(now), Rating.Easy, now, {
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const low = review(graduated, Rating.Good, now, {
      desiredRetention: 0.8,
      enableFuzz: false,
    });
    const high = review(graduated, Rating.Good, now, {
      desiredRetention: 0.95,
      enableFuzz: false,
    });
    expect(high.due.getTime()).toBeLessThan(low.due.getTime());
  });

  it("custom w changes next due vs default with fuzz off", async () => {
    const { default_w } = await import("ts-fsrs");
    const now = new Date("2026-01-01T12:00:00.000Z");
    const later = new Date("2026-01-10T12:00:00.000Z");
    const graduated = review(newCard(now), Rating.Easy, now, {
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const w = default_w.map((x, i) => (i === 8 ? x * 3 : x));
    const withDefault = review(graduated, Rating.Good, later, {
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const withCustom = review(graduated, Rating.Good, later, {
      desiredRetention: 0.9,
      enableFuzz: false,
      w,
    });
    expect(withCustom.due.getTime()).not.toBe(withDefault.due.getTime());
  });
});
