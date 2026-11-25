import { describe, it, expect } from "vitest";
import {
  assertSingleCloze,
  parseCardDrafts,
  CardDraftSchema,
} from "../../worker/generation/schema";

describe("assertSingleCloze", () => {
  it("allows multi-blank cloze", () => {
    expect(() => assertSingleCloze("{{c1::a}} and {{c2::b}}")).not.toThrow();
  });

  it("allows a single Anki cloze blank", () => {
    expect(() =>
      assertSingleCloze("Paris is {{c1::France}}'s capital"),
    ).not.toThrow();
  });

  it("allows multiple underscore blanks within the cap", () => {
    expect(() => assertSingleCloze("___ and ___")).not.toThrow();
  });

  it("rejects more than eight blanks", () => {
    const front = Array.from({ length: 9 }, (_, i) => `{{c${i + 1}::x}}`).join(
      " ",
    );
    expect(() => assertSingleCloze(front)).toThrow(/at most 8 blanks/);
  });
});

describe("CardDraft schema", () => {
  it("parses valid qa and cloze drafts", () => {
    const drafts = parseCardDrafts([
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance: { pages: [1], excerpt: "ex" },
      },
      {
        type: "cloze",
        front: "Hello {{c1::world}}",
        back: "world",
        provenance: { pages: [1], excerpt: "ex" },
      },
    ]);
    expect(drafts).toHaveLength(2);
  });

  it("parses cloze with multiple blanks via schema", () => {
    const result = CardDraftSchema.safeParse({
      type: "cloze",
      front: "{{c1::a}} and {{c2::b}}",
      back: "x",
      provenance: { pages: [1], excerpt: "ex" },
    });
    expect(result.success).toBe(true);
  });

  it("parses cloze with empty Extra back", () => {
    const result = CardDraftSchema.safeParse({
      type: "cloze",
      front: "The organelle is {{c1::mitochondria}}.",
      back: "",
      provenance: { pages: [1], excerpt: "organelle" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.back).toBe("");
    }
  });

  it("rejects qa with empty back", () => {
    const result = CardDraftSchema.safeParse({
      type: "qa",
      front: "What is ATP?",
      back: "",
      provenance: { pages: [1], excerpt: "ATP" },
    });
    expect(result.success).toBe(false);
  });

  const mcqBase = {
    type: "mcq" as const,
    front: "What is ATP?",
    back: "Adenosine triphosphate",
    options: ["Adenosine triphosphate", "Glucose", "DNA"],
    provenance: { pages: [1], excerpt: "ATP energy" },
  };

  it("parses valid mcq with 3–5 options", () => {
    expect(CardDraftSchema.safeParse(mcqBase).success).toBe(true);
    const four = {
      ...mcqBase,
      options: [...mcqBase.options, "RNA"],
    };
    expect(CardDraftSchema.safeParse(four).success).toBe(true);
    const five = {
      ...mcqBase,
      options: [...mcqBase.options, "RNA", "Lipids"],
    };
    expect(CardDraftSchema.safeParse(five).success).toBe(true);
  });

  it("rejects mcq with fewer than 3 or more than 5 options", () => {
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: ["Adenosine triphosphate", "Glucose"],
      }).success,
    ).toBe(false);
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: [
          "Adenosine triphosphate",
          "Glucose",
          "DNA",
          "RNA",
          "Lipids",
          "Water",
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects mcq with duplicate or empty options", () => {
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: ["Adenosine triphosphate", "Glucose", "Glucose"],
      }).success,
    ).toBe(false);
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: ["Adenosine triphosphate", "  ", "DNA"],
      }).success,
    ).toBe(false);
  });

  it("rejects mcq when back is not one of the options", () => {
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        back: "Not an option",
      }).success,
    ).toBe(false);
  });

  it("keeps valid mcq when parseCardDrafts skips invalid mcq drafts", () => {
    const drafts = parseCardDrafts([
      mcqBase,
      { ...mcqBase, options: ["a", "b"] },
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance: { pages: [1], excerpt: "ex" },
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.type)).toEqual(["mcq", "qa"]);
  });

  it("keeps multi-blank cloze drafts with valid cards", () => {
    const drafts = parseCardDrafts([
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance: { pages: [1], excerpt: "ex" },
      },
      {
        type: "cloze",
        front: "{{c1::a}} and {{c2::b}}",
        back: "a",
        provenance: { pages: [1], excerpt: "ex" },
      },
      {
        type: "cloze",
        front: "Hello {{c1::world}}",
        back: "world",
        provenance: { pages: [1], excerpt: "ex" },
      },
    ]);
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.type)).toEqual(["qa", "cloze", "cloze"]);
    expect(drafts[1]?.front).toBe("{{c1::a}} and {{c2::b}}");
  });
});
