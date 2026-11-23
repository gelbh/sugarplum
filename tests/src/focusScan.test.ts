import { describe, expect, it } from "vitest";
import {
  scanFocus,
  type FocusEntry,
  type FocusMaterial,
} from "../../src/atlas/hub/focusScan";
import { atlasAbbrevIndex } from "../../src/atlas/hub/packMatch";

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
  it("returns Standard, out of pack, when there are no materials", () => {
    expect(scanFocus(entry, [])).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: [],
      inPack: false,
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
      inPack: true,
    });
  });

  it("Key via early page text", () => {
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
      inPack: true,
    });
  });

  it("Key via any page text on tutorial / practical / past_paper", () => {
    const materials = [
      mat({
        id: "m3",
        sourceRole: "tutorial",
        filename: "tut.pdf",
        pages: [
          { page: 1, text: "Intro only" },
          { page: 13, text: "Appendix: Fasciola hepatica" },
        ],
      }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "key",
      reason: 'Named in tutorial "tut.pdf"',
      materialIds: ["m3"],
      inPack: true,
    });
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
      inPack: true,
    });
  });

  it("Standard but in pack when mentioned in fewer than 3 materials", () => {
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
      materialIds: ["a", "b"],
      inPack: true,
    });
  });

  it("manual override wins over the scan tier; pack matches still apply", () => {
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
      materialIds: ["m1"],
      inPack: true,
    });
    expect(scanFocus(entry, materials, "key")).toEqual({
      tier: "key",
      reason: "Manual pin",
      materialIds: ["m1"],
      inPack: true,
    });
    expect(scanFocus(entry, [], "frequent")).toEqual({
      tier: "frequent",
      reason: "Manual demote",
      materialIds: [],
      inPack: false,
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

  it("matches hyphenated aliases against spaced page text", () => {
    const hyphenEntry: FocusEntry = {
      canonicalName: "Fasciola hepatica",
      commonName: null,
      aliases: ["fasciola-hepatica"],
    };
    expect(
      scanFocus(hyphenEntry, [
        mat({
          id: "h1",
          sourceRole: "tutorial",
          pages: [{ page: 1, text: "Today: fasciola hepatica lifecycle" }],
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

  it("a single lecture mention is Standard and in pack", () => {
    const materials = [
      mat({
        id: "lec",
        sourceRole: "lecture",
        pages: [{ page: 3, text: "Fasciola hepatica in sheep" }],
      }),
      mat({ id: "other", sourceRole: "lecture", pages: [{ page: 1, text: "Ticks" }] }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: ["lec"],
      inPack: true,
    });
  });

  it("a lenient-only hit in a tutorial stays Standard (tiers use the strict matcher)", () => {
    const materials = [
      mat({
        id: "tut",
        sourceRole: "tutorial",
        pages: [{ page: 1, text: "Fasciola (hepatica, gigantica)" }],
      }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: ["tut"],
      inPack: true,
    });
  });

  it("glued F.hepatica in a tutorial is Key (high)", () => {
    expect(
      scanFocus(entry, [
        mat({
          id: "g",
          sourceRole: "tutorial",
          pages: [{ page: 1, text: "Key parasite: F.hepatica" }],
        }),
      ]).tier,
    ).toBe("key");
  });

  it("OCR fuzzy-only in a tutorial stays Standard but in pack (low)", () => {
    const otodectes: FocusEntry = {
      canonicalName: "Otodectes cynotis",
      commonName: null,
      aliases: [],
    };
    expect(
      scanFocus(otodectes, [
        mat({
          id: "ocr",
          sourceRole: "tutorial",
          pages: [{ page: 1, text: "Otodectes cyanosis in the ear canal" }],
        }),
      ]),
    ).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: ["ocr"],
      inPack: true,
    });
  });

  it("ambiguous genus initial is not Key until the full genus appears", () => {
    const foo: FocusEntry = {
      canonicalName: "Foo canis",
      commonName: null,
      aliases: [],
    };
    const felis: FocusEntry = {
      canonicalName: "Felis canis",
      commonName: null,
      aliases: [],
    };
    const abbrev = atlasAbbrevIndex([foo, felis]);
    const bare = [
      mat({
        id: "bare",
        sourceRole: "tutorial",
        pages: [{ page: 1, text: "F. canis eggs in soil" }],
      }),
    ];
    expect(scanFocus(foo, bare, null, undefined, abbrev).tier).toBe("standard");
    expect(scanFocus(felis, bare, null, undefined, abbrev).tier).toBe(
      "standard",
    );

    const scoped = [
      mat({
        id: "scoped",
        sourceRole: "tutorial",
        pages: [
          { page: 1, text: "Foo is common. Later F. canis eggs persist." },
        ],
      }),
    ];
    expect(scanFocus(foo, scoped, null, undefined, abbrev).tier).toBe("key");
    expect(scanFocus(felis, scoped, null, undefined, abbrev).tier).toBe(
      "standard",
    );
  });

  it("an entry no material names is out of pack", () => {
    const materials = [
      mat({ id: "lec", sourceRole: "lecture", pages: [{ page: 1, text: "Ticks and mites" }] }),
    ];
    expect(scanFocus(entry, materials)).toEqual({
      tier: "standard",
      reason: "Standard",
      materialIds: [],
      inPack: false,
    });
  });
});
