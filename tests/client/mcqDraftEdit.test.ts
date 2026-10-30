import { describe, expect, it } from "vitest";
import {
  MCQ_MAX,
  MCQ_MIN,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  withMcqOptionText,
} from "../../src/lib/mcqDraftEdit";

const draft = { options: ["Paris", "Rome", "Oslo"], back: "Paris" };

describe("mcqDraftEdit", () => {
  it("keeps the correct answer when its text is edited", () => {
    expect(withMcqOptionText(draft, 0, "Paris, France")).toEqual({
      options: ["Paris, France", "Rome", "Oslo"],
      back: "Paris, France",
    });
  });

  it("leaves the correct answer when another option is edited", () => {
    expect(withMcqOptionText(draft, 1, "Madrid").back).toBe("Paris");
  });

  it("marks the picked option correct", () => {
    expect(withMcqCorrect(draft, 2).back).toBe("Oslo");
  });

  it("moves correctness to the first non-empty option when the correct one is removed", () => {
    const four = { options: ["Paris", "", "Rome", "Oslo"], back: "Paris" };
    expect(withMcqOptionRemoved(four, 0)).toEqual({
      options: ["", "Rome", "Oslo"],
      back: "Rome",
    });
  });

  it("stops removing at the minimum", () => {
    expect(draft.options).toHaveLength(MCQ_MIN);
    expect(withMcqOptionRemoved(draft, 1)).toBe(draft);
  });

  it("stops adding at the maximum", () => {
    const full = { options: ["a", "b", "c", "d", "e"], back: "a" };
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
