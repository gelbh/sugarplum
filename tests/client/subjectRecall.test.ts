import { describe, expect, it } from "vitest";
import { aggregateSubjectRecall } from "../../src/study/subjectRecall";

describe("aggregateSubjectRecall", () => {
  it("all null → null avg and 0 etk", () => {
    expect(aggregateSubjectRecall([null, null])).toEqual({
      avgRetrievability: null,
      etk: 0,
    });
  });

  it("ignores nulls in mean and sum", () => {
    expect(aggregateSubjectRecall([0.5, null, 1])).toEqual({
      avgRetrievability: 0.75,
      etk: 1.5,
    });
  });

  it("empty → null avg and 0 etk", () => {
    expect(aggregateSubjectRecall([])).toEqual({
      avgRetrievability: null,
      etk: 0,
    });
  });
});
