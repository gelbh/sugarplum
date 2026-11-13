import { describe, expect, it } from "vitest";
import { gradeAnswer, normalizeAnswer } from "../../src/anatomy/gradeAnswer";

describe("normalizeAnswer", () => {
  it("trims, lower-cases, and collapses whitespace", () => {
    expect(normalizeAnswer("  Femur   Head  ")).toBe("femur head");
  });

  it("returns empty for whitespace-only input", () => {
    expect(normalizeAnswer("   \t  ")).toBe("");
  });
});

describe("gradeAnswer", () => {
  const femur = {
    label: "Femur",
    info: { alsoKnownAs: ["Thigh bone", "  Os  femoris "] },
  };

  it("accepts the structure label case-insensitively", () => {
    expect(gradeAnswer("FEMUR", femur)).toBe(true);
    expect(gradeAnswer(" femur ", femur)).toBe(true);
  });

  it("accepts alsoKnownAs synonyms after normalize", () => {
    expect(gradeAnswer("thigh bone", femur)).toBe(true);
    expect(gradeAnswer("Os femoris", femur)).toBe(true);
  });

  it("rejects wrong answers and empty input", () => {
    expect(gradeAnswer("tibia", femur)).toBe(false);
    expect(gradeAnswer("", femur)).toBe(false);
    expect(gradeAnswer("   ", femur)).toBe(false);
  });

  it("works when alsoKnownAs is missing", () => {
    expect(gradeAnswer("radius", { label: "Radius" })).toBe(true);
    expect(gradeAnswer("ulna", { label: "Radius" })).toBe(false);
  });
});
