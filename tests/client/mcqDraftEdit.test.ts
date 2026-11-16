import { describe, expect, it } from "vitest";
import {
  MCQ_MAX,
  MCQ_MIN,
  mcqBack,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
} from "../../src/lib/mcqDraftEdit";

const draft = { options: ["Paris", "Rome", "Oslo"], correctIndex: 0 };

describe("mcqDraftEdit", () => {
  it("keeps the correct index when its text is edited", () => {
    expect(withMcqOptionText(draft, 0, "Paris, France")).toEqual({
      options: ["Paris, France", "Rome", "Oslo"],
      correctIndex: 0,
    });
    expect(mcqBack(withMcqOptionText(draft, 0, "Paris, France"))).toBe(
      "Paris, France",
    );
  });

  it("leaves the correct index when another option is edited", () => {
    expect(withMcqOptionText(draft, 1, "Madrid").correctIndex).toBe(0);
  });

  it("marks the picked option correct by index", () => {
    expect(withMcqCorrect(draft, 2)).toEqual({
      options: ["Paris", "Rome", "Oslo"],
      correctIndex: 2,
    });
    expect(mcqBack(withMcqCorrect(draft, 2))).toBe("Oslo");
  });

  it("keeps the chosen index when duplicate labels share text", () => {
    const dup = { options: ["asd", "asd", "asd"], correctIndex: 0 };
    expect(withMcqCorrect(dup, 2).correctIndex).toBe(2);
  });

  it("moves correctness when the correct option is removed", () => {
    const four = {
      options: ["Paris", "", "Rome", "Oslo"],
      correctIndex: 0,
    };
    expect(withMcqOptionRemoved(four, 0)).toEqual({
      options: ["", "Rome", "Oslo"],
      correctIndex: 1,
    });
  });

  it("shifts correctIndex down when an earlier option is removed", () => {
    const four = {
      options: ["a", "b", "c", "d"],
      correctIndex: 2,
    };
    expect(withMcqOptionRemoved(four, 0).correctIndex).toBe(1);
  });

  it("stops removing at the minimum", () => {
    expect(draft.options).toHaveLength(MCQ_MIN);
    expect(withMcqOptionRemoved(draft, 1)).toBe(draft);
  });

  it("stops adding at the maximum", () => {
    const full = {
      options: ["a", "b", "c", "d", "e"],
      correctIndex: 0,
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
