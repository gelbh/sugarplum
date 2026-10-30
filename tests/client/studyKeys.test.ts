/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  hasShortcutModifier,
  isInteractiveKeyTarget,
  mcqOptionIndexForKey,
  resolveStudyKey,
} from "../../src/study/studyKeys";

describe("resolveStudyKey", () => {
  it("flips on Space on either face", () => {
    expect(resolveStudyKey(" ", false)).toEqual({ type: "flip" });
    expect(resolveStudyKey(" ", true)).toEqual({ type: "flip" });
  });

  it("grades digits and arrows only after reveal, matching swipe directions", () => {
    const cases: [string, number][] = [
      ["1", 1],
      ["ArrowLeft", 1],
      ["2", 2],
      ["ArrowDown", 2],
      ["3", 3],
      ["ArrowRight", 3],
      ["4", 4],
      ["ArrowUp", 4],
    ];
    for (const [key, rating] of cases) {
      expect(resolveStudyKey(key, true)).toEqual({ type: "grade", rating });
      expect(resolveStudyKey(key, false)).toEqual({ type: "none" });
    }
  });

  it("ignores unrelated keys", () => {
    expect(resolveStudyKey("5", true)).toEqual({ type: "none" });
    expect(resolveStudyKey("Enter", true)).toEqual({ type: "none" });
  });
});

describe("mcqOptionIndexForKey", () => {
  it("maps 1-based digits within the option count", () => {
    expect(mcqOptionIndexForKey("1", 4)).toBe(0);
    expect(mcqOptionIndexForKey("4", 4)).toBe(3);
    expect(mcqOptionIndexForKey("5", 4)).toBeNull();
    expect(mcqOptionIndexForKey("0", 4)).toBeNull();
    expect(mcqOptionIndexForKey("ArrowLeft", 4)).toBeNull();
  });
});

describe("key guards", () => {
  it("treats native controls as interactive", () => {
    const button = document.createElement("button");
    const span = document.createElement("span");
    button.append(span);
    expect(isInteractiveKeyTarget(span)).toBe(true);
    expect(isInteractiveKeyTarget(document.createElement("div"))).toBe(false);
    expect(isInteractiveKeyTarget(null)).toBe(false);
  });

  it("flags Ctrl/Cmd/Alt combos", () => {
    const base = { ctrlKey: false, metaKey: false, altKey: false };
    expect(hasShortcutModifier(base)).toBe(false);
    expect(hasShortcutModifier({ ...base, metaKey: true })).toBe(true);
  });
});
