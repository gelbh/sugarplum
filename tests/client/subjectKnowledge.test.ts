import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  MATURE_INTERVAL_DAYS,
  aggregateSubjectKnowledge,
  classifyKnowledgeBucket,
  composeSubjectKnowledge,
} from "../../src/study/subjectKnowledge";

describe("classifyKnowledgeBucket", () => {
  it("missing schedule → new", () => {
    expect(
      classifyKnowledgeBucket({ state: null, scheduled_days: null }),
    ).toBe("new");
  });

  it("State.New → new", () => {
    expect(
      classifyKnowledgeBucket({ state: State.New, scheduled_days: 0 }),
    ).toBe("new");
  });

  it("Learning and Relearning → learning", () => {
    expect(
      classifyKnowledgeBucket({ state: State.Learning, scheduled_days: 0 }),
    ).toBe("learning");
    expect(
      classifyKnowledgeBucket({ state: State.Relearning, scheduled_days: 1 }),
    ).toBe("learning");
  });

  it("Review below mature interval → young", () => {
    expect(
      classifyKnowledgeBucket({
        state: State.Review,
        scheduled_days: MATURE_INTERVAL_DAYS - 1,
      }),
    ).toBe("young");
  });

  it("Review at mature interval → mature", () => {
    expect(
      classifyKnowledgeBucket({
        state: State.Review,
        scheduled_days: MATURE_INTERVAL_DAYS,
      }),
    ).toBe("mature");
  });
});

describe("aggregateSubjectKnowledge", () => {
  it("empty → zeros and null pct", () => {
    expect(aggregateSubjectKnowledge([])).toEqual({
      new: 0,
      learning: 0,
      young: 0,
      mature: 0,
      total: 0,
      graduated: 0,
      graduatedPct: null,
    });
  });

  it("sums buckets and integer graduatedPct", () => {
    const out = aggregateSubjectKnowledge([
      { state: State.New, scheduled_days: 0 },
      { state: State.Review, scheduled_days: 10 },
      { state: State.Review, scheduled_days: 21 },
      { state: State.Learning, scheduled_days: 0 },
    ]);
    expect(out).toEqual({
      new: 1,
      learning: 1,
      young: 1,
      mature: 1,
      total: 4,
      graduated: 2,
      graduatedPct: 50,
    });
  });
});

describe("composeSubjectKnowledge", () => {
  const incomplete = {
    state: null as number | null,
    scheduled_days: null as number | null,
    due: null as string | null,
    stability: null as number | null,
    difficulty: null as number | null,
    elapsed_days: null as number | null,
    learning_steps: null as number | null,
    reps: null as number | null,
    lapses: null as number | null,
    last_review: null as string | null,
  };

  it("incomplete rows → buckets only, null avg, 0 count", () => {
    const out = composeSubjectKnowledge(
      [incomplete],
      new Date("2026-11-09T12:00:00.000Z"),
    );
    expect(out.total).toBe(1);
    expect(out.new).toBe(1);
    expect(out.avgRetrievability).toBeNull();
    expect(out.etk).toBe(0);
    expect(out.recallCardCount).toBe(0);
  });

  it("complete Review row → non-null R and recallCardCount 1", () => {
    const out = composeSubjectKnowledge(
      [
        {
          state: State.Review,
          scheduled_days: 10,
          due: "2026-11-10T12:00:00.000Z",
          stability: 10,
          difficulty: 5,
          elapsed_days: 0,
          learning_steps: 0,
          reps: 1,
          lapses: 0,
          last_review: "2026-11-09T12:00:00.000Z",
        },
      ],
      new Date("2026-11-09T12:00:00.000Z"),
    );
    expect(out.young).toBe(1);
    expect(out.total).toBe(1);
    expect(out.recallCardCount).toBe(1);
    expect(out.avgRetrievability).not.toBeNull();
    expect(out.avgRetrievability).toBe(out.etk);
  });
});
