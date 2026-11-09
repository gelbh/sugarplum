import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  MATURE_STABILITY_DAYS,
  aggregateSubjectKnowledge,
  classifyKnowledgeBucket,
} from "../../src/study/subjectKnowledge";

describe("classifyKnowledgeBucket", () => {
  it("missing schedule → new", () => {
    expect(classifyKnowledgeBucket({ state: null, stability: null })).toBe(
      "new",
    );
  });

  it("State.New → new", () => {
    expect(
      classifyKnowledgeBucket({ state: State.New, stability: 0 }),
    ).toBe("new");
  });

  it("Learning and Relearning → learning", () => {
    expect(
      classifyKnowledgeBucket({ state: State.Learning, stability: 0.1 }),
    ).toBe("learning");
    expect(
      classifyKnowledgeBucket({ state: State.Relearning, stability: 1 }),
    ).toBe("learning");
  });

  it("Review below mature threshold → young", () => {
    expect(
      classifyKnowledgeBucket({
        state: State.Review,
        stability: MATURE_STABILITY_DAYS - 1,
      }),
    ).toBe("young");
  });

  it("Review at mature threshold → mature", () => {
    expect(
      classifyKnowledgeBucket({
        state: State.Review,
        stability: MATURE_STABILITY_DAYS,
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
      { state: State.New, stability: 0 },
      { state: State.Review, stability: 10 },
      { state: State.Review, stability: 21 },
      { state: State.Learning, stability: 0.5 },
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
