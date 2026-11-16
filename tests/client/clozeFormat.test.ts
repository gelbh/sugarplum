import { describe, expect, it } from "vitest";
import {
  assertSingleCloze,
  blankClozeFront,
  CLOZE_EXTRA_LABEL,
  clozeExtraSubtitle,
  composeClozeFront,
  extractClozeAnswer,
  parseClozeDiyFields,
  revealClozeFront,
} from "../../src/lib/clozeFormat";

describe("blankClozeFront", () => {
  it("replaces Anki cloze with ellipsis blank and hides answer", () => {
    const front =
      "Entamoeba histolytica belongs to phylum {{c1::Amoebozoa}} and order";
    const blanked = blankClozeFront(front);
    expect(blanked).not.toMatch(/\{\{c/);
    expect(blanked).not.toContain("Amoebozoa");
    expect(blanked).toContain("[…]");
    expect(blanked).toBe(
      "Entamoeba histolytica belongs to phylum […] and order",
    );
  });

  it("shows hint text instead of blank when hint is present", () => {
    const front = "The capital is {{c1::Paris::city of light}}.";
    expect(blankClozeFront(front)).toBe("The capital is city of light.");
  });

  it("leaves non-cloze text unchanged", () => {
    const plain = "What is ATP?";
    expect(blankClozeFront(plain)).toBe(plain);
  });
});

describe("revealClozeFront", () => {
  it("fills the deleted text without braces", () => {
    const front =
      "Entamoeba histolytica belongs to phylum {{c1::Amoebozoa}} and order";
    expect(revealClozeFront(front)).toBe(
      "Entamoeba histolytica belongs to phylum Amoebozoa and order",
    );
    expect(revealClozeFront(front)).not.toMatch(/\{\{/);
  });

  it("drops hint segment and keeps answer only", () => {
    const front = "The capital is {{c1::Paris::city of light}}.";
    expect(revealClozeFront(front)).toBe("The capital is Paris.");
  });
});

describe("extractClozeAnswer", () => {
  it("returns deleted text for a single cloze", () => {
    expect(
      extractClozeAnswer(
        "Entamoeba histolytica belongs to phylum {{c1::Amoebozoa}} and order",
      ),
    ).toBe("Amoebozoa");
  });

  it("returns answer not hint when hint is present", () => {
    expect(
      extractClozeAnswer("The capital is {{c1::Paris::city of light}}."),
    ).toBe("Paris");
  });

  it("returns null when no cloze marker", () => {
    expect(extractClozeAnswer("Plain question")).toBeNull();
  });
});

describe("clozeExtraSubtitle", () => {
  it("returns null for empty Extra", () => {
    expect(clozeExtraSubtitle("")).toBeNull();
    expect(clozeExtraSubtitle("   ")).toBeNull();
  });

  it("returns trimmed Extra when non-empty", () => {
    expect(clozeExtraSubtitle("  Anki Extra note  ")).toBe("Anki Extra note");
  });
});

describe("DraftCardEditor cloze Extra label", () => {
  it("labels the back field Extra (optional)", () => {
    expect(CLOZE_EXTRA_LABEL).toBe("Extra (optional)");
  });
});

describe("assertSingleCloze", () => {
  it("allows a single Anki blank", () => {
    expect(() =>
      assertSingleCloze("The {{c1::femur}} is the thigh bone"),
    ).not.toThrow();
  });

  it("allows two Anki blanks", () => {
    expect(() =>
      assertSingleCloze("The {{c1::a}} and {{c2::b}}"),
    ).not.toThrow();
  });

  it("rejects too many Anki blanks", () => {
    const front = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((n) => `{{c${n}::x}}`)
      .join(" ");
    expect(() => assertSingleCloze(front)).toThrow(/at most 8 blanks/);
  });
});

describe("composeClozeFront", () => {
  it("wraps the first blank occurrence", () => {
    const r = composeClozeFront("The capital is Paris", "Paris");
    expect(r).toEqual({ ok: true, front: "The capital is {{c1::Paris}}" });
  });

  it("wraps multiple blanks left to right", () => {
    const r = composeClozeFront("The cat sat on the mat", ["cat", "mat"]);
    expect(r).toEqual({
      ok: true,
      front: "The {{c1::cat}} sat on the {{c2::mat}}",
    });
  });

  it("errors when blank is missing from sentence", () => {
    const r = composeClozeFront("The capital is Paris", "London");
    expect(r).toEqual({
      ok: false,
      error: "Put the blank text inside the sentence.",
    });
  });

  it("does not wrap a letter prefix inside a longer word", () => {
    const r = composeClozeFront("The capital is Paris", "P");
    expect(r.ok).toBe(false);
  });
});

describe("parseClozeDiyFields", () => {
  it("round-trips one blank", () => {
    expect(parseClozeDiyFields("The capital is {{c1::Paris}}")).toEqual({
      sentence: "The capital is Paris",
      blanks: ["Paris"],
    });
  });

  it("round-trips multiple blanks", () => {
    expect(
      parseClozeDiyFields("The {{c1::cat}} sat on the {{c2::mat}}"),
    ).toEqual({
      sentence: "The cat sat on the mat",
      blanks: ["cat", "mat"],
    });
  });

  it("returns null for plain text", () => {
    expect(parseClozeDiyFields("No blank here")).toBeNull();
  });
});
