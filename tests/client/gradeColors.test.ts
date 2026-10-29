import { describe, expect, it } from "vitest";
import { gradeColorVars } from "../../src/study/gradeColors";

describe("gradeColorVars", () => {
  it("maps each FSRS rating to brand spectrum CSS vars", () => {
    expect(gradeColorVars(1)).toEqual({
      border: "var(--sp-grade-again-border)",
      fg: "var(--sp-grade-again-fg)",
      wash: "var(--sp-grade-again-wash)",
    });
    expect(gradeColorVars(2)).toEqual({
      border: "var(--sp-grade-hard-border)",
      fg: "var(--sp-grade-hard-fg)",
      wash: "var(--sp-grade-hard-wash)",
    });
    expect(gradeColorVars(3)).toEqual({
      border: "var(--sp-grade-good-border)",
      fg: "var(--sp-grade-good-fg)",
      wash: "var(--sp-grade-good-wash)",
    });
    expect(gradeColorVars(4)).toEqual({
      border: "var(--sp-grade-easy-border)",
      fg: "var(--sp-grade-easy-fg)",
      wash: "var(--sp-grade-easy-wash)",
    });
  });
});
