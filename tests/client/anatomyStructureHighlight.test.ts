import { describe, expect, it } from "vitest";
import { highlightModeFor } from "../../src/anatomy/structureHighlight";

describe("highlightModeFor", () => {
  it("is none when neither selected nor hovered", () => {
    expect(highlightModeFor("a", null, null)).toBe("none");
    expect(highlightModeFor("a", "b", "c")).toBe("none");
  });

  it("is selected when only selected", () => {
    expect(highlightModeFor("a", "a", null)).toBe("selected");
    expect(highlightModeFor("a", "a", "b")).toBe("selected");
  });

  it("is hover when only hovered", () => {
    expect(highlightModeFor("a", null, "a")).toBe("hover");
    expect(highlightModeFor("a", "b", "a")).toBe("hover");
  });

  it("is both when selected and hovered", () => {
    expect(highlightModeFor("a", "a", "a")).toBe("both");
  });
});
