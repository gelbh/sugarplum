import { describe, expect, it } from "vitest";
import {
  applyCutoverMemory,
  replayMemoryFromLogs,
} from "../../src/study/fsrsCutover";
import { emptyFsrsCard } from "../../src/study/retrievability";

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
