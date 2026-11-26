import { describe, expect, it } from "vitest";
import {
  applyCutoverMemory,
  replayMemoryFromLogs,
} from "../../../../src/study/fsrs/fsrsCutover";
import {
  cardFromScheduleRow,
  emptyFsrsCard,
} from "../../../../src/study/fsrs/retrievability";
import { State } from "ts-fsrs";

describe("replayMemoryFromLogs", () => {
  it("rebuilds FSRS-7 memory including stabilityFast", async () => {
    const memory = await replayMemoryFromLogs(
      [
        { reviewed_at: "2026-01-01T12:00:00.000Z", rating: 3 },
        { reviewed_at: "2026-01-03T12:00:00.000Z", rating: 3 },
        { reviewed_at: "2026-01-10T12:00:00.000Z", rating: 4 },
      ],
      { desiredRetention: 0.9, enableFuzz: false, modelVersion: "FSRS-7" },
    );
    expect(memory).not.toBeNull();
    expect(memory!.stability).toBeGreaterThan(0);
    expect(memory!.stabilityFast).toBeGreaterThan(0);
    expect(Number.isFinite(memory!.difficulty)).toBe(true);
  });

  it("returns null for empty history", async () => {
    expect(
      await replayMemoryFromLogs([], {
        desiredRetention: 0.9,
        enableFuzz: false,
      }),
    ).toBeNull();
  });

  it("cardFromScheduleRow does not invent Sf=S when fast is missing", () => {
    const card = cardFromScheduleRow({
      due: "2026-03-01T12:00:00.000Z",
      stability: 12,
      difficulty: 4,
      elapsed_days: 3,
      scheduled_days: 5,
      learning_steps: 0,
      reps: 4,
      lapses: 0,
      state: State.Review,
      last_review: "2026-02-20T12:00:00.000Z",
      stability_fast: null,
      card_id: "c1",
    });
    expect(card.stability).toBe(12);
    expect(card.stabilityFast).toBe(0);
  });

  it("cardFromScheduleRow keeps persisted stability_fast", () => {
    const card = cardFromScheduleRow({
      due: "2026-03-01T12:00:00.000Z",
      stability: 12,
      difficulty: 4,
      elapsed_days: 3,
      scheduled_days: 5,
      learning_steps: 0,
      reps: 4,
      lapses: 0,
      state: State.Review,
      last_review: "2026-02-20T12:00:00.000Z",
      stability_fast: 9.5,
      card_id: "c1",
    });
    expect(card.stabilityFast).toBe(9.5);
  });

  it("applyCutoverMemory preserves due and counters", () => {
    const due = new Date("2026-03-01T12:00:00.000Z");
    const card = emptyFsrsCard(due, "c1");
    card.dueAt = due;
    card.reps = 5;
    card.lapses = 1;
    card.lastReviewAt = new Date("2026-01-10T12:00:00.000Z");
    const next = applyCutoverMemory(card, {
      stability: 12,
      difficulty: 4,
      stabilityFast: 9,
    });
    expect(next.dueAt.toISOString()).toBe(due.toISOString());
    expect(next.reps).toBe(5);
    expect(next.lapses).toBe(1);
    expect(next.stability).toBe(12);
    expect(next.stabilityFast).toBe(9);
  });
});
