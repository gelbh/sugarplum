/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  faceScrollsFor,
  mcqOptionIndexForKey,
  mcqOptionKey,
  plainShortcutKey,
  resolveStudyKey,
  reviewArrowDecision,
} from "../../src/study/studyKeys";

describe("resolveStudyKey", () => {
  it("Space reveals the question face and hides the answer face", () => {
    expect(resolveStudyKey(" ", false)).toEqual({ type: "reveal" });
    expect(resolveStudyKey(" ", true)).toEqual({ type: "hide" });
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

describe("MCQ keys", () => {
  it("maps 1-based digits within the option count", () => {
    expect(mcqOptionIndexForKey("1", 4)).toBe(0);
    expect(mcqOptionIndexForKey("4", 4)).toBe(3);
    expect(mcqOptionIndexForKey("5", 4)).toBeNull();
    expect(mcqOptionIndexForKey("0", 4)).toBeNull();
    expect(mcqOptionIndexForKey("ArrowLeft", 4)).toBeNull();
  });

  it("labels options 1-9 and none past the digit range", () => {
    expect(mcqOptionKey(0)).toBe("1");
    expect(mcqOptionKey(8)).toBe("9");
    expect(mcqOptionKey(9)).toBeNull();
  });
});

describe("key guards", () => {
  const plain = {
    key: "3",
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null as EventTarget | null,
  };

  it("passes plain keys and drops repeats, modifier combos and typing targets", () => {
    expect(plainShortcutKey(plain)).toBe("3");
    expect(plainShortcutKey({ ...plain, repeat: true })).toBeNull();
    expect(plainShortcutKey({ ...plain, metaKey: true })).toBeNull();
    expect(
      plainShortcutKey({ ...plain, target: document.createElement("input") }),
    ).toBeNull();
    expect(
      plainShortcutKey({ ...plain, target: document.createElement("button") }),
    ).toBe("3");
  });

});

describe("faceScrollsFor", () => {
  const face = (scrollTop: number) => ({
    scrollTop,
    clientHeight: 100,
    scrollHeight: 300,
  });

  it("lets Up/Down scroll until the matching edge", () => {
    expect(faceScrollsFor("ArrowDown", face(0))).toBe(true);
    expect(faceScrollsFor("ArrowDown", face(200))).toBe(false);
    expect(faceScrollsFor("ArrowUp", face(0))).toBe(false);
    expect(faceScrollsFor("ArrowUp", face(50))).toBe(true);
  });

  it("never scrolls for other keys or a non-scrolling face", () => {
    expect(faceScrollsFor("ArrowLeft", face(50))).toBe(false);
    expect(faceScrollsFor("ArrowDown", null)).toBe(false);
  });
});

describe("reviewArrowDecision", () => {
  it("decides inside the stage and ignores keys outside it", () => {
    const stage = document.createElement("div");
    const chip = document.createElement("button");
    stage.append(chip);
    const outside = document.createElement("a");
    const event = {
      key: "ArrowLeft",
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    };
    expect(reviewArrowDecision(event, chip, stage)).toBe("reject");
    expect(reviewArrowDecision(event, document.body, stage)).toBe("reject");
    expect(reviewArrowDecision(event, outside, stage)).toBeNull();
    expect(
      reviewArrowDecision(event, document.createElement("textarea"), stage),
    ).toBeNull();
    const select = document.createElement("div");
    select.setAttribute("role", "combobox");
    stage.append(select);
    expect(
      reviewArrowDecision({ ...event, key: "ArrowRight" }, select, stage),
    ).toBeNull();
  });
});
