import { describe, expect, it } from "vitest";
import {
  isSourceRole,
  suggestSourceRole,
  SOURCE_ROLES,
} from "../../src/lib/sourceRole";

describe("suggestSourceRole", () => {
  it("defaults to lecture for empty or unrelated names", () => {
    expect(suggestSourceRole(null)).toBe("lecture");
    expect(suggestSourceRole(undefined)).toBe("lecture");
    expect(suggestSourceRole("")).toBe("lecture");
    expect(suggestSourceRole("Week1_Intro.pdf")).toBe("lecture");
  });

  it("maps past / exam / paper to past_paper (first priority)", () => {
    expect(suggestSourceRole("PAST_PAPER_2024.pdf")).toBe("past_paper");
    expect(suggestSourceRole("final-exam.pdf")).toBe("past_paper");
    expect(suggestSourceRole("paper_1.pdf")).toBe("past_paper");
    expect(suggestSourceRole("exam_tutorial.pdf")).toBe("past_paper");
  });

  it("maps tutorial / tut (word-ish) to tutorial", () => {
    expect(suggestSourceRole("Week2_TUTORIAL.pdf")).toBe("tutorial");
    expect(suggestSourceRole("parasites_tut.pdf")).toBe("tutorial");
    expect(suggestSourceRole("TUT-03.pptx")).toBe("tutorial");
    expect(suggestSourceRole("statue.pdf")).toBe("lecture");
  });

  it("maps practical / prac / lab to practical", () => {
    expect(suggestSourceRole("PRACTICAL_3.pdf")).toBe("practical");
    expect(suggestSourceRole("week4_prac.pdf")).toBe("practical");
    expect(suggestSourceRole("Lab_session.pdf")).toBe("practical");
  });

  it("maps note* to notes", () => {
    expect(suggestSourceRole("my_notes.txt")).toBe("notes");
    expect(suggestSourceRole("Note.pdf")).toBe("notes");
  });
});

describe("isSourceRole", () => {
  it("accepts only known roles", () => {
    for (const role of SOURCE_ROLES) {
      expect(isSourceRole(role)).toBe(true);
    }
    expect(isSourceRole("handout")).toBe(false);
    expect(isSourceRole(1)).toBe(false);
  });
});
