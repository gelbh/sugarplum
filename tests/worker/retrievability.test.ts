import { describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import {
  cardFromScheduleRow,
  retrievability,
} from "../../src/study/retrievability";

const NOW = new Date("2026-10-28T15:00:00.000Z");

describe("retrievability", () => {
  it("returns null for New state", () => {
    const card = cardFromScheduleRow({
      due: "2026-10-28T12:00:00.000Z",
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      last_review: null,
    });
    expect(retrievability(card, NOW)).toBeNull();
  });

  it("returns null when last_review is null even if state is Review", () => {
    const card = cardFromScheduleRow({
      due: "2026-10-28T12:00:00.000Z",
      stability: 10,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 5,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: State.Review,
      last_review: null,
    });
    expect(retrievability(card, NOW)).toBeNull();
  });
});
