import { describe, it, expect } from "vitest";
import { Rating, newCard, review } from "../../../worker/study/fsrs";

describe("fsrs review", () => {
  it("good rating schedules later due", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const before = newCard(now);
    const after = await review(before, Rating.Good, now);
    expect(after.dueAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("higher desiredRetention schedules a sooner due with fuzz off", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const graduated = await review(newCard(now), Rating.Easy, now, {
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const low = await review(graduated, Rating.Good, now, {
      desiredRetention: 0.8,
      enableFuzz: false,
    });
    const high = await review(graduated, Rating.Good, now, {
      desiredRetention: 0.95,
      enableFuzz: false,
    });
    expect(high.dueAt.getTime()).toBeLessThan(low.dueAt.getTime());
  });

  it("custom w changes next due vs default with fuzz off", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    const now = new Date("2026-01-01T12:00:00.000Z");
    const later = new Date("2026-01-10T12:00:00.000Z");
    const graduated = await review(newCard(now), Rating.Easy, now, {
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const w = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    const withDefault = await review(graduated, Rating.Good, later, {
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const withCustom = await review(graduated, Rating.Good, later, {
      desiredRetention: 0.9,
      enableFuzz: false,
      w,
    });
    expect(withCustom.dueAt.getTime()).not.toBe(withDefault.dueAt.getTime());
  });
});
