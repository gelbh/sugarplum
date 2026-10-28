import { describe, expect, it } from "vitest";
import {
  friendlyStageHeadline,
  orderPresentStages,
  formatEtaSubline,
  formatRelativeAge,
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
