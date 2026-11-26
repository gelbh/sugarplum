import { describe, expect, it } from "vitest";
import {
  encodeMcqAnswers,
  mcqOptionButtonDisabled,
  mcqSetRating,
  mcqTapRating,
  parseMcqAnswers,
  shuffledMcqOptions,
} from "../../../../src/study/faces/mcqStudy";

describe("parseMcqAnswers / encodeMcqAnswers", () => {
  const options = ["Paris", "Rome", "Oslo", "Madrid"];

  it("round-trips a single answer as a plain string", () => {
    expect(encodeMcqAnswers(["Rome"], options)).toBe("Rome");
    expect(parseMcqAnswers("Rome", options)).toEqual(["Rome"]);
  });

  it("round-trips several answers in options order", () => {
    const encoded = encodeMcqAnswers(["Madrid", "Paris"], options);
    expect(parseMcqAnswers(encoded, options)).toEqual(["Paris", "Madrid"]);
  });

  it("grades multi-select as exact set match", () => {
    expect(mcqSetRating(["Paris", "Madrid"], ["Paris", "Madrid"])).toBe(3);
    expect(mcqSetRating(["Paris"], ["Paris", "Madrid"])).toBe(1);
    expect(mcqSetRating(["Paris", "Rome"], ["Paris", "Madrid"])).toBe(1);
  });
});

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
