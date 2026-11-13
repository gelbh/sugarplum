import { describe, expect, it } from "vitest";
import { learningSoftWaitFollowUpCopy } from "../../src/study/learningSoftWaitCopy";

describe("learningSoftWaitFollowUpCopy", () => {
  it("clarifies hard-grade follow-ups for plural pending", () => {
    expect(learningSoftWaitFollowUpCopy(2)).toBe(
      "Short-term follow-ups come back shortly. 2 learning cards still waiting.",
    );
  });

  it("uses singular card for one pending", () => {
    expect(learningSoftWaitFollowUpCopy(1)).toBe(
      "Short-term follow-ups come back shortly. 1 learning card still waiting.",
    );
  });
});
