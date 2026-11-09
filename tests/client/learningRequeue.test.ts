import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  earliestPendingDueAt,
  isShortTermFollowUp,
  mergeDueLearning,
  nextLearningWakeAt,
  upsertPendingLearning,
} from "../../src/study/learningRequeue";

describe("isShortTermFollowUp", () => {
  const gradedAt = new Date("2026-11-09T12:00:00.000Z");

  it("true for Learning state even if due is hours ahead", () => {
    expect(
      isShortTermFollowUp({
        dueIso: "2026-11-09T12:10:00.000Z",
        gradedAt,
        state: State.Learning,
      }),
    ).toBe(true);
  });

  it("false for Review with multi-day due", () => {
    expect(
      isShortTermFollowUp({
        dueIso: "2026-11-12T12:00:00.000Z",
        gradedAt,
        state: State.Review,
      }),
    ).toBe(false);
  });

  it("true when state omitted but due within 24h", () => {
    expect(
      isShortTermFollowUp({
        dueIso: "2026-11-09T12:10:00.000Z",
        gradedAt,
      }),
    ).toBe(true);
  });
});

describe("upsert + merge + wake", () => {
  it("replaces same cardId and merges when due", () => {
    const card = { id: "a" };
    let pending = upsertPendingLearning([], {
      cardId: "a",
      dueAt: "2026-11-09T12:10:00.000Z",
      card,
    });
    pending = upsertPendingLearning(pending, {
      cardId: "a",
      dueAt: "2026-11-09T12:01:00.000Z",
      card,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.dueAt).toBe("2026-11-09T12:01:00.000Z");

    const merged = mergeDueLearning(
      [],
      pending,
      new Date("2026-11-09T12:01:00.000Z"),
    );
    expect(merged.queue.map((c) => c.id)).toEqual(["a"]);
    expect(merged.pending).toHaveLength(0);
  });

  it("does not duplicate id already in queue", () => {
    const card = { id: "a" };
    const pending = [{ cardId: "a", dueAt: "2026-11-09T12:00:00.000Z", card }];
    const merged = mergeDueLearning(
      [card],
      pending,
      new Date("2026-11-09T12:00:00.000Z"),
    );
    expect(merged.queue).toHaveLength(1);
    expect(merged.pending).toHaveLength(0);
  });

  it("nextLearningWakeAt returns earliest future due", () => {
    const wake = nextLearningWakeAt(
      [
        {
          cardId: "a",
          dueAt: "2026-11-09T12:10:00.000Z",
          card: { id: "a" },
        },
        {
          cardId: "b",
          dueAt: "2026-11-09T12:05:00.000Z",
          card: { id: "b" },
        },
      ],
      new Date("2026-11-09T12:00:00.000Z"),
    );
    expect(wake?.toISOString()).toBe("2026-11-09T12:05:00.000Z");
  });

  it("earliestPendingDueAt ignores wake filtering", () => {
    expect(
      earliestPendingDueAt([
        {
          cardId: "a",
          dueAt: "2026-11-09T12:10:00.000Z",
          card: { id: "a" },
        },
        {
          cardId: "b",
          dueAt: "2026-11-09T12:05:00.000Z",
          card: { id: "b" },
        },
      ]),
    ).toBe("2026-11-09T12:05:00.000Z");
  });

  it("nextLearningWakeAt is null when all pending are already due", () => {
    expect(
      nextLearningWakeAt(
        [
          {
            cardId: "a",
            dueAt: "2026-11-09T11:59:00.000Z",
            card: { id: "a" },
          },
        ],
        new Date("2026-11-09T12:00:00.000Z"),
      ),
    ).toBeNull();
  });
});
