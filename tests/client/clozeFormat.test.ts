import { describe, expect, it } from "vitest";
import {
  blankClozeFront,
  CLOZE_EXTRA_LABEL,
  clozeExtraSubtitle,
  extractClozeAnswer,
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
    expect(extractClozeAnswer("The capital is {{c1::Paris::city of light}}.")).toBe(
      "Paris",
    );
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
