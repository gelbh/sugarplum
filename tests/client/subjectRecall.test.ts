import { describe, expect, it } from "vitest";
import { aggregateSubjectRecall } from "../../src/study/subjectRecall";

describe("aggregateSubjectRecall", () => {
  it("all null → null avg, 0 etk, 0 count", () => {
    expect(aggregateSubjectRecall([null, null])).toEqual({
      avgRetrievability: null,
      etk: 0,
      recallCardCount: 0,
    });
  });

  it("ignores nulls in mean, sum, and count", () => {
    expect(aggregateSubjectRecall([0.5, null, 1])).toEqual({
      avgRetrievability: 0.75,
      etk: 1.5,
      recallCardCount: 2,
    });
  });

  it("empty → null avg, 0 etk, 0 count", () => {
    expect(aggregateSubjectRecall([])).toEqual({
      avgRetrievability: null,
      etk: 0,
      recallCardCount: 0,
    });
  });
});
