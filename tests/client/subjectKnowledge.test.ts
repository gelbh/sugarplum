import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  MATURE_INTERVAL_DAYS,
  aggregateSubjectKnowledge,
  classifyKnowledgeBucket,
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
