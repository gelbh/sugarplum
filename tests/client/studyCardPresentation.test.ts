import { describe, expect, it } from "vitest";
import {
  isMcqCard,
  studyFrontText,
} from "../../src/study/studyCardPresentation";

describe("studyCardPresentation", () => {
  it("detects mcq cards", () => {
    expect(isMcqCard({ type: "mcq" } as never)).toBe(true);
    expect(isMcqCard({ type: "basic" } as never)).toBe(false);
    expect(isMcqCard(null)).toBe(false);
  });

  it("reads string fronts", () => {
    expect(studyFrontText({ front: "Hello" } as never)).toBe("Hello");
  });
});
