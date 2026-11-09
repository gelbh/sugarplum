import { describe, expect, it } from "vitest";
import { aggregateSubjectRecall } from "../../src/study/subjectRecall";

describe("aggregateSubjectRecall", () => {
  it("all null non-empty → avg 0, etk 0, count length", () => {
    expect(aggregateSubjectRecall([null, null])).toEqual({
      avgRetrievability: 0,
      etk: 0,
      recallCardCount: 2,
    });
  });

  it("nulls coalesce to 0 in mean and sum", () => {
    expect(aggregateSubjectRecall([0.5, null, 1])).toEqual({
      avgRetrievability: 0.5,
      etk: 1.5,
      recallCardCount: 3,
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
