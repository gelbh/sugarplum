import { describe, expect, it } from "vitest";
import { harvestRuleDrafts } from "../../worker/generation/rules";
import { assertSingleCloze, CardDraftSchema } from "../../worker/generation/schema";

describe("harvestRuleDrafts", () => {
  it("parses Question :: Answer as qa", () => {
    const drafts = harvestRuleDrafts("What is ATP :: Adenosine triphosphate");
    expect(drafts).toEqual([
      {
        type: "qa",
        front: "What is ATP",
        back: "Adenosine triphosphate",
        provenance: {
          pages: [1],
          excerpt: "What is ATP :: Adenosine triphosphate",
        },
      },
    ]);
  });

  it("parses Q | A as qa", () => {
    const drafts = harvestRuleDrafts("Capital of France | Paris");
    expect(drafts).toEqual([
      {
        type: "qa",
        front: "Capital of France",
        back: "Paris",
        provenance: {
          pages: [1],
          excerpt: "Capital of France | Paris",
        },
      },
    ]);
  });

  it("parses term: definition as qa with term as front", () => {
    const drafts = harvestRuleDrafts("mitochondria: powerhouse of the cell");
    expect(drafts).toEqual([
      {
        type: "qa",
        front: "mitochondria",
        back: "powerhouse of the cell",
        provenance: {
          pages: [1],
          excerpt: "mitochondria: powerhouse of the cell",
        },
      },
    ]);
  });

  it("parses term - definition as qa with term as front", () => {
    const drafts = harvestRuleDrafts("glycolysis - breakdown of glucose");
    expect(drafts).toEqual([
      {
        type: "qa",
        front: "glycolysis",
        back: "breakdown of glucose",
        provenance: {
          pages: [1],
          excerpt: "glycolysis - breakdown of glucose",
        },
      },
    ]);
  });

  it("converts a single bold into a cloze draft", () => {
    const line = "The **mitochondria** produces ATP.";
    const drafts = harvestRuleDrafts(line);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      type: "cloze",
      front: "The {{c1::mitochondria}} produces ATP.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: line },
    });
    assertSingleCloze(drafts[0]!.front);
    expect(CardDraftSchema.safeParse(drafts[0]).success).toBe(true);
  });

  it("harvests an existing single Anki cloze on a line", () => {
    const line = "Paris is {{c1::France}}'s capital.";
    const drafts = harvestRuleDrafts(line);
    expect(drafts).toEqual([
      {
        type: "cloze",
        front: "Paris is {{c1::France}}'s capital.",
        back: "France",
        provenance: { pages: [1], excerpt: line },
      },
    ]);
    assertSingleCloze(drafts[0]!.front);
  });

  it("emits one single-blank cloze draft per bold on a multi-bold line", () => {
    const line = "**A** and **B** are letters.";
    const drafts = harvestRuleDrafts(line);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual({
      type: "cloze",
      front: "{{c1::A}} and B are letters.",
      back: "A",
      provenance: { pages: [1], excerpt: line },
    });
    expect(drafts[1]).toEqual({
      type: "cloze",
      front: "A and {{c1::B}} are letters.",
      back: "B",
      provenance: { pages: [1], excerpt: line },
    });
    for (const draft of drafts) {
      assertSingleCloze(draft.front);
      expect(CardDraftSchema.safeParse(draft).success).toBe(true);
    }
  });

  it("skips fenced code blocks", () => {
    const text = [
      "Keep :: this",
      "```",
      "skip :: me",
      "**bold** inside fence",
      "```",
      "Also :: keep",
    ].join("\n");
    const drafts = harvestRuleDrafts(text);
    expect(drafts.map((d) => d.front)).toEqual(["Keep", "Also"]);
    expect(drafts.map((d) => d.back)).toEqual(["this", "keep"]);
  });

  it("preserves stable source order across mixed formats", () => {
    const text = [
      "First :: one",
      "term: two",
      "Line with **three** here.",
      "Four | four-back",
      "five - five-back",
    ].join("\n");
    const drafts = harvestRuleDrafts(text);
    expect(drafts.map((d) => d.front)).toEqual([
      "First",
      "term",
      "Line with {{c1::three}} here.",
      "Four",
      "five",
    ]);
    expect(drafts.every((d) => d.provenance.pages[0] === 1)).toBe(true);
    expect(drafts.map((d) => d.provenance.excerpt)).toEqual([
      "First :: one",
      "term: two",
      "Line with **three** here.",
      "Four | four-back",
      "five - five-back",
    ]);
  });

  it("returns empty array when nothing matches", () => {
    expect(harvestRuleDrafts("Just a plain paragraph.\n\nAnother sentence.")).toEqual(
      [],
    );
  });
});
