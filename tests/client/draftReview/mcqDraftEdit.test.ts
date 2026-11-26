import { describe, expect, it } from "vitest";
import {
  MCQ_MAX,
  MCQ_MIN,
  mcqBack,
  withMcqAllowMultiple,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
} from "../../../src/draftReview/mcqDraftEdit";

const draft = {
  options: ["Paris", "Rome", "Oslo"],
  correctIndices: [0],
  allowMultiple: false,
};

describe("mcqDraftEdit", () => {
  it("keeps the correct index when its text is edited", () => {
    expect(withMcqOptionText(draft, 0, "Paris, France")).toEqual({
      options: ["Paris, France", "Rome", "Oslo"],
      correctIndices: [0],
      allowMultiple: false,
    });
    expect(mcqBack(withMcqOptionText(draft, 0, "Paris, France"))).toBe(
      "Paris, France",
    );
  });

  it("leaves the correct index when another option is edited", () => {
    expect(withMcqOptionText(draft, 1, "Madrid").correctIndices).toEqual([0]);
  });

  it("marks the picked option correct by index", () => {
    expect(withMcqCorrect(draft, 2)).toEqual({
      options: ["Paris", "Rome", "Oslo"],
      correctIndices: [2],
      allowMultiple: false,
    });
    expect(mcqBack(withMcqCorrect(draft, 2))).toBe("Oslo");
  });

  it("keeps the chosen index when duplicate labels share text", () => {
    const dup = {
      options: ["asd", "asd", "asd"],
      correctIndices: [0],
      allowMultiple: false,
    };
    expect(withMcqCorrect(dup, 2).correctIndices).toEqual([2]);
  });

  it("toggles several correct answers when allowMultiple", () => {
    const multi = withMcqAllowMultiple(draft, true);
    const two = withMcqCorrect(multi, 2);
    expect(two.correctIndices).toEqual([0, 2]);
    expect(mcqBack(two)).toBe(`Paris\u001fOslo`);
    expect(withMcqCorrect(two, 0).correctIndices).toEqual([2]);
  });

  it("collapses to one correct when disabling allowMultiple", () => {
    const multi = {
      options: ["Paris", "Rome", "Oslo"],
      correctIndices: [0, 2],
      allowMultiple: true,
    };
    expect(withMcqAllowMultiple(multi, false).correctIndices).toEqual([0]);
  });

  it("moves correctness when the correct option is removed", () => {
    const four = {
      options: ["Paris", "", "Rome", "Oslo"],
      correctIndices: [0],
      allowMultiple: false,
    };
    expect(withMcqOptionRemoved(four, 0)).toEqual({
      options: ["", "Rome", "Oslo"],
      correctIndices: [1],
      allowMultiple: false,
    });
  });

  it("shifts correctIndex down when an earlier option is removed", () => {
    const four = {
      options: ["a", "b", "c", "d"],
      correctIndices: [2],
      allowMultiple: false,
    };
    expect(withMcqOptionRemoved(four, 0).correctIndices).toEqual([1]);
  });

  it("stops removing at the minimum", () => {
    expect(draft.options).toHaveLength(MCQ_MIN);
    expect(withMcqOptionRemoved(draft, 1)).toBe(draft);
  });

  it("stops adding at the maximum", () => {
    const full = {
      options: ["a", "b", "c", "d", "e"],
      correctIndices: [0],
      allowMultiple: false,
    };
    expect(full.options).toHaveLength(MCQ_MAX);
    expect(withMcqOptionAdded(full)).toBe(full);
    expect(withMcqOptionAdded(draft).options).toEqual([
      "Paris",
      "Rome",
      "Oslo",
      "",
    ]);
  });
});
