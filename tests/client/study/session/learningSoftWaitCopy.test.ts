import { describe, expect, it } from "vitest";
import {
  learningSoftWaitFollowUpCopy,
  learningSoftWaitReadyDueCopy,
} from "../../../../src/study/session/learningSoftWaitCopy";

describe("learningSoftWaitFollowUpCopy", () => {
  it("clarifies session short-term park for plural pending", () => {
    expect(learningSoftWaitFollowUpCopy(2)).toBe(
      "2 short-term learning cards still waiting in this session.",
    );
  });

  it("uses singular card for one pending", () => {
    expect(learningSoftWaitFollowUpCopy(1)).toBe(
      "1 short-term learning card still waiting in this session.",
    );
  });
});

describe("learningSoftWaitReadyDueCopy", () => {
  it("plural", () => {
    expect(learningSoftWaitReadyDueCopy(35)).toBe(
      "35 other cards are due now on Today.",
    );
  });

  it("singular", () => {
    expect(learningSoftWaitReadyDueCopy(1)).toBe(
      "1 other card is due now on Today.",
    );
  });
});
