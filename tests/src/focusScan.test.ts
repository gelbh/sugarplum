import { describe, expect, it } from "vitest";
import {
  scanFocus,
  type FocusEntry,
  type FocusMaterial,
} from "../../src/atlas/focusScan";

const entry: FocusEntry = {
  canonicalName: "Fasciola hepatica",
  commonName: "liver fluke",
  aliases: ["common liver fluke"],
};

function mat(
  partial: Partial<FocusMaterial> & Pick<FocusMaterial, "id" | "sourceRole">,
): FocusMaterial {
  return {
    filename: null,
    pages: [],
    ...partial,
  };
}

describe("scanFocus", () => {
  it("returns Standard with empty materialIds when there are no materials", () => {
    expect(scanFocus(entry, [])).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: [],
    });
  });

  it("Key via filename on tutorial / practical / past_paper", () => {
    const materials = [
      mat({
        id: "m1",
        sourceRole: "tutorial",
        filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "key",
      reason: 'Named in tutorial "Week2_Fasciola_hepatica_TUTORIAL.pdf"',
      materialIds: ["m1"],
    });
  });

  it("Key via page 1 or 2 text", () => {
    const materials = [
      mat({
        id: "m2",
        sourceRole: "practical",
        filename: "lab3.pdf",
        pages: [
          { page: 1, text: "Intro" },
          { page: 2, text: "Today: Fasciola hepatica lifecycle" },
        ],
      }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "key",
      reason: 'Named in practical "lab3.pdf"',
      materialIds: ["m2"],
    });
  });

  it("does not Key from page 3+ only", () => {
    const materials = [
      mat({
        id: "m3",
        sourceRole: "tutorial",
        filename: "tut.pdf",
        pages: [{ page: 3, text: "Appendix: Fasciola hepatica" }],
      }),
    ];
    expect(scanFocus(entry, materials).tier).toBe("standard");
  });

  it("lecture cannot Key even when named on page 1", () => {
    const materials = [
      mat({
        id: "lec",
        sourceRole: "lecture",
        filename: "week1.pdf",
        pages: [{ page: 1, text: "Fasciola hepatica overview" }],
      }),
    ];
    expect(scanFocus(entry, materials).tier).toBe("standard");
  });

  it("Frequent when named in ≥3 distinct materials (any role)", () => {
    const materials = [
      mat({
        id: "a",
        sourceRole: "lecture",
        pages: [{ page: 1, text: "Fasciola hepatica" }],
      }),
      mat({
        id: "b",
        sourceRole: "notes",
        filename: "notes_on_fasciola_hepatica.txt",
      }),
      mat({
        id: "c",
        sourceRole: "lecture",
        pages: [{ page: 5, text: "See also Fasciola hepatica" }],
      }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "frequent",
      reason: "Mentioned in 3 materials",
      materialIds: ["a", "b", "c"],
    });
  });

  it("Standard when mentioned in fewer than 3 materials", () => {
    const materials = [
      mat({
        id: "a",
        sourceRole: "lecture",
        pages: [{ page: 1, text: "Fasciola hepatica" }],
      }),
      mat({
        id: "b",
        sourceRole: "notes",
        pages: [{ page: 1, text: "Fasciola hepatica" }],
      }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: [],
    });
  });

  it("manual override wins over scan; materialIds empty", () => {
    const materials = [
      mat({
        id: "m1",
        sourceRole: "tutorial",
        filename: "Fasciola_hepatica_tutorial.pdf",
      }),
    ];
    expect(scanFocus(entry, materials, "standard")).toEqual({
      tier: "standard",
      reason: "Manual demote",
      materialIds: [],
    });
    expect(scanFocus(entry, materials, "key")).toEqual({
      tier: "key",
      reason: "Manual pin",
      materialIds: [],
    });
    expect(scanFocus(entry, [], "frequent")).toEqual({
      tier: "frequent",
      reason: "Manual demote",
      materialIds: [],
    });
  });

  it("matches genus-initial forms in filename and early pages", () => {
    expect(
      scanFocus(entry, [
        mat({
          id: "g1",
          sourceRole: "past_paper",
          filename: "exam_F._hepatica.pdf",
        }),
      ]).tier,
    ).toBe("key");

    expect(
      scanFocus(entry, [
        mat({
          id: "g2",
          sourceRole: "tutorial",
          pages: [{ page: 1, text: "Key parasite: F. hepatica" }],
        }),
      ]).tier,
    ).toBe("key");
  });

  it("matches commonName and aliases for Frequent / Key", () => {
    expect(
      scanFocus(entry, [
        mat({
          id: "cm",
          sourceRole: "tutorial",
          pages: [{ page: 1, text: "The liver fluke is common" }],
        }),
      ]).tier,
    ).toBe("key");
  });
});
