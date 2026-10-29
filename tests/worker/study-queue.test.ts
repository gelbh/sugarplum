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
  rFloor: 0.8,
};

const DEFAULT_OPTS: BuildStudyQueueOpts = {
  overdueDayStartIso: LOCAL_DAY_START,
};

function candidate(
  overrides: Partial<QueueCandidate> & Pick<QueueCandidate, "id">,
): QueueCandidate {
  return {
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

function newCard(id: string, due = "2026-10-28T12:00:00.000Z"): QueueCandidate {
  return candidate({ id, due, state: State.New, reps: 0, last_review: null });
}

/** High-stability review: R stays well above floor for +1..3d. */
function highRReview(
  id: string,
  due = "2026-10-28T12:00:00.000Z",
): QueueCandidate {
  return candidate({
    id,
    due,
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
    const result = buildStudyQueue(
      reviews,
      DEFAULT_PREFS,
      NOW,
      DEFAULT_OPTS,
    );
    expect(result.meta.reviewUsed).toBe(3);
    expect(result.meta.deferredCount).toBe(0);
    expect(result.dueIds).toEqual(["r-0", "r-1", "r-2"]);
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
