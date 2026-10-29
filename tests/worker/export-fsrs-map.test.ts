import { describe, it, expect } from "vitest";
import { mapScheduleToAnki } from "../../worker/export/fsrsMap";

describe("mapScheduleToAnki", () => {
  it("preserves FSRS scalars and non-new state", () => {
    const row = {
      due: "2026-06-15T12:00:00.000Z",
      stability: 12.5,
      difficulty: 6.2,
      elapsed_days: 3,
      scheduled_days: 14,
      reps: 7,
      lapses: 2,
      state: 2,
      last_review: "2026-06-01T08:30:00.000Z",
    };
    const mapped = mapScheduleToAnki(row);
    expect(mapped.stability).toBe(12.5);
    expect(mapped.difficulty).toBe(6.2);
    expect(mapped.reps).toBe(7);
    expect(mapped.state).toBe(2);
    expect(mapped.elapsedDays).toBe(3);
    expect(mapped.scheduledDays).toBe(14);
    expect(mapped.lapses).toBe(2);
  });

  it("maps due and last_review to unix seconds (UTC)", () => {
    const row = {
      due: "2026-06-15T12:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      last_review: "2026-06-01T08:30:00.000Z",
    };
    const mapped = mapScheduleToAnki(row);
    expect(mapped.due).toBe(Math.floor(Date.parse(row.due) / 1000));
    expect(mapped.lastReview).toBe(
      Math.floor(Date.parse(row.last_review!) / 1000),
    );
  });

  it("maps null last_review to null", () => {
    const mapped = mapScheduleToAnki({
      due: "2026-01-01T00:00:00.000Z",
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });
    expect(mapped.lastReview).toBeNull();
  });
});
