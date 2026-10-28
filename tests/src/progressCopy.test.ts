import { describe, expect, it } from "vitest";
import {
  friendlyStageHeadline,
  orderPresentStages,
  formatEtaSubline,
  formatRelativeAge,
  progressDetailsModel,
} from "../../src/progress/copy";

describe("friendlyStageHeadline", () => {
  it("maps critique", () => {
    expect(friendlyStageHeadline("critique")).toBe("Reviewing your cards");
  });
  it("falls back for unknown", () => {
    expect(friendlyStageHeadline("nope")).toBe("Preparing your cards");
  });
});

describe("orderPresentStages", () => {
  it("orders by catalog not discovery", () => {
    expect(orderPresentStages(["critique", "extract", "generate"])).toEqual([
      "extract",
      "generate",
      "critique",
    ]);
  });
});

describe("formatEtaSubline", () => {
  it("Calculating when null", () => {
    expect(formatEtaSubline(null)).toBe("Calculating…");
  });
  it("About Ns left", () => {
    expect(formatEtaSubline(52_000)).toBe("About 52s left");
  });
});

describe("formatRelativeAge", () => {
  it("just now under 1s", () => {
    expect(formatRelativeAge(400)).toBe("just now");
  });
});

describe("progressDetailsModel", () => {
  it("uses 1-based section and free jobs wording", () => {
    const m = progressDetailsModel({
      current: 3,
      total: 3,
      draftsSoFar: 10,
      projectedCards: 120,
      projectedTokens: 40000,
      freeQuota: { remaining: 2 },
    });
    expect(m.sectionLine).toBe("Section 3 of 3");
    expect(m.freeJobsLine).toBe("2 free jobs left");
    expect(m.jobLine).toMatch(/10/);
    expect(m.tokensLine).toMatch(/40000|40/);
  });

  it("omits free jobs when quota null", () => {
    expect(
      progressDetailsModel({ current: 1, total: 2, freeQuota: null })
        .freeJobsLine,
    ).toBeNull();
  });
});
