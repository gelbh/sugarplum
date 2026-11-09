import { describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import {
  buildStudyQueue,
  type BuildStudyQueueOpts,
  type QueueCandidate,
  type StudyPrefs,
} from "../../worker/study/queue";

const NOW = new Date("2026-10-28T15:00:00.000Z");
const LOCAL_DAY_START = "2026-10-28T00:00:00.000Z";

const DEFAULT_PREFS: StudyPrefs = {
  introBudget: 20,
  reviewBudget: 200,
  rFloor: 0.9,
  desiredRetention: 0.9,
  enableFuzz: true,
};

const DEFAULT_OPTS: BuildStudyQueueOpts = {
  overdueDayStartIso: LOCAL_DAY_START,
};

function candidate(
  overrides: Partial<QueueCandidate> & Pick<QueueCandidate, "id">,
): QueueCandidate {
  return {
    deck_id: "deck-default",
    due: "2026-10-28T12:00:00.000Z",
    state: State.New,
    reps: 0,
    last_review: null,
    lapses: 0,
    again_14d: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    ...overrides,
  };
}

function newCard(
  id: string,
  due = "2026-10-28T12:00:00.000Z",
  deckId = "deck-default",
): QueueCandidate {
  return candidate({
    id,
    due,
    deck_id: deckId,
    state: State.New,
    reps: 0,
    last_review: null,
  });
}

/** High-stability review: R stays well above floor for +1..3d. */
function highRReview(
  id: string,
  due = "2026-10-28T12:00:00.000Z",
  deckId = "deck-default",
): QueueCandidate {
  return candidate({
    id,
    due,
    deck_id: deckId,
    state: State.Review,
    reps: 5,
    last_review: "2026-10-27T12:00:00.000Z",
    lapses: 0,
    again_14d: 0,
    stability: 100,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 10,
    learning_steps: 0,
  });
}

describe("buildStudyQueue intro", () => {
  it("holds surplus new cards at default intro budget (50 → 20, held 30)", () => {
    const candidates = Array.from({ length: 50 }, (_, i) =>
      newCard(`n-${String(i).padStart(2, "0")}`),
    );
    const result = buildStudyQueue(
      candidates,
      DEFAULT_PREFS,
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.selected).toHaveLength(20);
    expect(result.dueIds).toHaveLength(20);
    expect(result.meta.introUsed).toBe(20);
    expect(result.meta.introBudget).toBe(20);
    expect(result.meta.heldIntroCount).toBe(30);
    expect(result.meta.introAlreadyUsedToday).toBe(0);
    expect(result.meta.introRemaining).toBe(20);
    expect(result.meta.reviewUsed).toBe(0);
    expect(result.deferrals).toHaveLength(0);
  });

  it("Study more adds another intro slice (introBonusSlices: 1 → 40)", () => {
    const candidates = Array.from({ length: 50 }, (_, i) =>
      newCard(`n-${String(i).padStart(2, "0")}`),
    );
    const result = buildStudyQueue(candidates, DEFAULT_PREFS, NOW, {
      ...DEFAULT_OPTS,
      introBonusSlices: 1,
    });
    expect(result.meta.introUsed).toBe(40);
    expect(result.meta.heldIntroCount).toBe(10);
    expect(result.selected).toHaveLength(40);
  });

  it("day-sticky: introAlreadyUsedToday reduces remaining slice", () => {
    const candidates = Array.from({ length: 50 }, (_, i) =>
      newCard(`n-${String(i).padStart(2, "0")}`),
    );
    const result = buildStudyQueue(candidates, DEFAULT_PREFS, NOW, {
      ...DEFAULT_OPTS,
      introAlreadyUsedToday: 15,
    });
    expect(result.meta.introAlreadyUsedToday).toBe(15);
    expect(result.meta.introRemaining).toBe(5);
    expect(result.meta.introUsed).toBe(5);
    expect(result.meta.heldIntroCount).toBe(45);
    expect(result.selected).toHaveLength(5);
  });

  it("day-sticky: exhausted intro admits zero new cards", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => newCard(`n-${i}`));
    const result = buildStudyQueue(candidates, DEFAULT_PREFS, NOW, {
      ...DEFAULT_OPTS,
      introAlreadyUsedToday: 20,
    });
    expect(result.meta.introUsed).toBe(0);
    expect(result.meta.introRemaining).toBe(0);
    expect(result.meta.heldIntroCount).toBe(10);
    expect(result.selected).toHaveLength(0);
  });

  it("treats reps===0 and null last_review as intro-eligible even if state is not New", () => {
    const candidates = Array.from({ length: 25 }, (_, i) =>
      candidate({
        id: `z-${i}`,
        state: State.Review,
        reps: 0,
        last_review: null,
      }),
    );
    const result = buildStudyQueue(
      candidates,
      DEFAULT_PREFS,
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.meta.introUsed).toBe(20);
    expect(result.meta.heldIntroCount).toBe(5);
  });
});

describe("buildStudyQueue review deferral", () => {
  it("never defers overdue reviews even when over budget", () => {
    const overdue = Array.from({ length: 5 }, (_, i) =>
      highRReview(`od-${i}`, "2026-10-27T12:00:00.000Z"),
    );
    const today = Array.from({ length: 200 }, (_, i) =>
      highRReview(`td-${String(i).padStart(3, "0")}`),
    );
    const result = buildStudyQueue(
      [...overdue, ...today],
      { ...DEFAULT_PREFS, reviewBudget: 200 },
      NOW,
      DEFAULT_OPTS,
    );
    for (const id of overdue.map((c) => c.id)) {
      expect(result.dueIds).toContain(id);
      expect(result.deferrals.find((d) => d.id === id)).toBeUndefined();
    }
    expect(result.meta.deferredCount).toBeGreaterThan(0);
    expect(result.deferrals.every((d) => d.id.startsWith("td-"))).toBe(true);
  });

  it("defers high-R reviews when over review budget", () => {
    const reviews = Array.from({ length: 210 }, (_, i) =>
      highRReview(`r-${String(i).padStart(3, "0")}`),
    );
    const result = buildStudyQueue(
      reviews,
      { ...DEFAULT_PREFS, reviewBudget: 200 },
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.meta.reviewBudget).toBe(200);
    expect(result.meta.reviewUsed).toBe(200);
    expect(result.meta.deferredCount).toBe(10);
    expect(result.deferrals).toHaveLength(10);
    for (const d of result.deferrals) {
      expect(d.newDue > "2026-10-28T12:00:00.000Z").toBe(true);
      expect(result.dueIds).not.toContain(d.id);
    }
    expect(result.selected).toHaveLength(200);
  });

  it("includes all reviews when under budget (no deferrals)", () => {
    const reviews = Array.from({ length: 3 }, (_, i) => highRReview(`r-${i}`));
    const result = buildStudyQueue(reviews, DEFAULT_PREFS, NOW, DEFAULT_OPTS);
    expect(result.meta.reviewUsed).toBe(3);
    expect(result.meta.deferredCount).toBe(0);
    expect(result.dueIds).toEqual(["r-0", "r-1", "r-2"]);
  });

  it("defers using desiredRetention even when rFloor is stale lower", () => {
    const reviews = Array.from({ length: 5 }, (_, i) =>
      highRReview(`r-${String(i).padStart(3, "0")}`),
    );
    const result = buildStudyQueue(
      reviews,
      {
        ...DEFAULT_PREFS,
        reviewBudget: 2,
        rFloor: 0.5,
        desiredRetention: 0.9,
      },
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.meta.deferredCount).toBe(3);
    expect(result.deferrals).toHaveLength(3);
  });

  it("keeps higher again_14d when R and lapses tie under soft budget", () => {
    const due = "2026-10-28T12:00:00.000Z";
    const base = {
      due,
      state: State.Review,
      reps: 5,
      last_review: "2026-10-27T12:00:00.000Z",
      lapses: 0,
      stability: 100,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 10,
      learning_steps: 0,
    };
    const result = buildStudyQueue(
      [
        candidate({ id: "quiet", ...base, again_14d: 0 }),
        candidate({ id: "again-heavy", ...base, again_14d: 4 }),
        candidate({ id: "again-once", ...base, again_14d: 1 }),
      ],
      { ...DEFAULT_PREFS, reviewBudget: 1 },
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.dueIds).toEqual(["again-heavy"]);
    expect(result.deferrals.map((d) => d.id).sort()).toEqual([
      "again-once",
      "quiet",
    ]);
  });
});

describe("buildStudyQueue deck interleaving", () => {
  it("round-robins ordinary reviews by deck while preserving within-deck due order", () => {
    const reviews = [
      highRReview("a1", "2026-10-28T10:00:00.000Z", "deck-a"),
      highRReview("a2", "2026-10-28T11:00:00.000Z", "deck-a"),
      highRReview("b1", "2026-10-28T10:30:00.000Z", "deck-b"),
    ];
    const result = buildStudyQueue(reviews, DEFAULT_PREFS, NOW, DEFAULT_OPTS);
    expect(result.dueIds).toEqual(["a1", "b1", "a2"]);
    expect(result.meta.reviewUsed).toBe(3);
    expect(result.meta.deferredCount).toBe(0);
    expect(result.meta.introUsed).toBe(0);
  });

  it("round-robins intro cards by deck", () => {
    const intros = [
      newCard("a1", "2026-10-28T10:00:00.000Z", "deck-a"),
      newCard("a2", "2026-10-28T11:00:00.000Z", "deck-a"),
      newCard("b1", "2026-10-28T10:30:00.000Z", "deck-b"),
    ];
    const result = buildStudyQueue(intros, DEFAULT_PREFS, NOW, DEFAULT_OPTS);
    expect(result.dueIds).toEqual(["a1", "b1", "a2"]);
    expect(result.meta.introUsed).toBe(3);
  });

  it("drains the remaining deck after the other is exhausted", () => {
    const reviews = [
      highRReview("a1", "2026-10-28T10:00:00.000Z", "deck-a"),
      highRReview("a2", "2026-10-28T11:00:00.000Z", "deck-a"),
      highRReview("a3", "2026-10-28T12:00:00.000Z", "deck-a"),
      highRReview("b1", "2026-10-28T10:30:00.000Z", "deck-b"),
    ];
    const result = buildStudyQueue(reviews, DEFAULT_PREFS, NOW, DEFAULT_OPTS);
    expect(result.dueIds).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("keeps single-deck due/id order unchanged", () => {
    const reviews = [
      highRReview("r2", "2026-10-28T11:00:00.000Z"),
      highRReview("r1", "2026-10-28T10:00:00.000Z"),
      highRReview("r3", "2026-10-28T12:00:00.000Z"),
    ];
    const result = buildStudyQueue(reviews, DEFAULT_PREFS, NOW, DEFAULT_OPTS);
    expect(result.dueIds).toEqual(["r1", "r2", "r3"]);
  });

  it("orders ordinary reviews by ascending retrievability before deck interleave", () => {
    const lowR = candidate({
      id: "low-r",
      deck_id: "deck-a",
      due: "2026-10-28T10:00:00.000Z",
      state: State.Review,
      reps: 5,
      last_review: "2026-10-20T12:00:00.000Z",
      lapses: 0,
      stability: 2,
      difficulty: 5,
      elapsed_days: 8,
      scheduled_days: 10,
      learning_steps: 0,
    });
    const highR = candidate({
      id: "high-r",
      deck_id: "deck-a",
      due: "2026-10-28T09:00:00.000Z",
      state: State.Review,
      reps: 5,
      last_review: "2026-10-27T12:00:00.000Z",
      lapses: 0,
      stability: 100,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 10,
      learning_steps: 0,
    });
    const learning = candidate({
      id: "learn-1",
      deck_id: "deck-b",
      due: "2026-10-28T12:00:00.000Z",
      state: State.Learning,
      reps: 1,
      last_review: "2026-10-28T11:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 1,
    });
    const result = buildStudyQueue(
      [highR, learning, lowR],
      DEFAULT_PREFS,
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.dueIds[0]).toBe("learn-1");
    expect(result.dueIds.indexOf("low-r")).toBeLessThan(
      result.dueIds.indexOf("high-r"),
    );
  });

  it("keeps forced learning ahead of interleaved regular reviews and intros", () => {
    const learning = candidate({
      id: "learn-1",
      deck_id: "deck-b",
      due: "2026-10-28T12:00:00.000Z",
      state: State.Learning,
      reps: 1,
      last_review: "2026-10-28T11:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 1,
    });
    const reviews = [
      highRReview("a1", "2026-10-28T10:00:00.000Z", "deck-a"),
      highRReview("b1", "2026-10-28T10:30:00.000Z", "deck-b"),
    ];
    const intros = [
      newCard("n-a", "2026-10-28T09:00:00.000Z", "deck-a"),
      newCard("n-b", "2026-10-28T09:30:00.000Z", "deck-b"),
    ];
    const result = buildStudyQueue(
      [learning, ...reviews, ...intros],
      DEFAULT_PREFS,
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.dueIds).toEqual(["learn-1", "a1", "b1", "n-a", "n-b"]);
    expect(result.meta.reviewUsed).toBe(3);
    expect(result.meta.introUsed).toBe(2);
  });
});
