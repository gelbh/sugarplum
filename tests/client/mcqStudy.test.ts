import { describe, expect, it } from "vitest";
import {
  mcqOptionButtonDisabled,
  mcqTapRating,
  shuffledMcqOptions,
} from "../../src/study/mcqStudy";

describe("mcqTapRating", () => {
  it("maps wrong tap to Again and correct tap to Good", () => {
    expect(mcqTapRating("Wrong", "Right")).toBe(1);
    expect(mcqTapRating("Right", "Right")).toBe(3);
  });

  it("trims whitespace so padded options still grade Good", () => {
    expect(mcqTapRating("ATP ", "ATP")).toBe(3);
    expect(mcqTapRating("ATP", "ATP ")).toBe(3);
  });
});

describe("mcqOptionButtonDisabled", () => {
  it("does not MUI-disable for feedback lock (dark action.disabled washes ivory card)", () => {
    expect(mcqOptionButtonDisabled(false, true)).toBe(false);
    expect(mcqOptionButtonDisabled(undefined, true)).toBe(false);
  });

  it("still respects parent disabled", () => {
    expect(mcqOptionButtonDisabled(true, false)).toBe(true);
    expect(mcqOptionButtonDisabled(true, true)).toBe(true);
  });
});

describe("shuffledMcqOptions", () => {
  const options = ["A", "B", "C", "D"];

  it("is stable for the same card id", () => {
    const a = shuffledMcqOptions("card-1", options);
    const b = shuffledMcqOptions("card-1", options);
    expect(b).toEqual(a);
  });

  it("permutes options without dropping entries", () => {
    const shuffled = shuffledMcqOptions("card-2", options);
    expect(shuffled.sort()).toEqual([...options].sort());
  });
});
