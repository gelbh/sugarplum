import { describe, expect, it } from "vitest";
import { remainderAfterRules } from "../../../worker/generation/pipeline";
import { harvestRuleDrafts } from "../../../worker/generation/rules";
import { assertSingleCloze, CardDraftSchema } from "../../../worker/generation/schema";

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
      "What is four | four-back",
      "five - five-back",
    ].join("\n");
    const drafts = harvestRuleDrafts(text);
    expect(drafts.map((d) => d.front)).toEqual([
      "First",
      "term",
      "Line with {{c1::three}} here.",
      "What is four",
      "five",
    ]);
    expect(drafts.every((d) => d.provenance.pages[0] === 1)).toBe(true);
    expect(drafts.map((d) => d.provenance.excerpt)).toEqual([
      "First :: one",
      "term: two",
      "Line with **three** here.",
      "What is four | four-back",
      "five - five-back",
    ]);
  });

  it("returns empty array when nothing matches", () => {
    expect(harvestRuleDrafts("Just a plain paragraph.\n\nAnother sentence.")).toEqual(
      [],
    );
  });

  it("does not harvest lecture prose with Note:/Figure:/dash appositives", () => {
    const text = [
      "Note: Always wash your hands before lab work.",
      "Figure 1: Structure of ATP synthase",
      "The mitochondria - often called the powerhouse - produce ATP.",
      "Chapter 3 - Cellular respiration overview",
      "Krebs cycle produces NADH in the matrix.",
      "mitochondria: powerhouse of the cell",
    ].join("\n");
    const drafts = harvestRuleDrafts(text);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      type: "qa",
      front: "mitochondria",
      back: "powerhouse of the cell",
    });
    const remainder = remainderAfterRules(text, drafts);
    expect(remainder).toContain("Note: Always wash");
    expect(remainder).toContain("Krebs cycle produces NADH");
    expect(remainder).not.toContain("mitochondria: powerhouse");
  });

  it("skips a line with Anki cloze plus underscore blank instead of throwing", () => {
    expect(() =>
      harvestRuleDrafts("The {{c1::foo}} and ___ blank"),
    ).not.toThrow();
    expect(harvestRuleDrafts("The {{c1::foo}} and ___ blank")).toEqual([]);
  });

  it("does not harvest lecture/PDF chrome colon-dash and table rows", () => {
    const text = [
      "• Extraintestinal - rare invasion of tissues",
      "Giardia species - disease",
      "Phylum | Hosts | Family",
      "Apicomplexa | humans | Plasmodiidae",
      "fission) and produce cysts: leftover fragment",
      "disease: pathology slide title alone",
      "lifecycle - overview",
      "What is mitosis :: Cell division producing two identical nuclei",
      "mitochondria: powerhouse of the cell",
    ].join("\n");
    const drafts = harvestRuleDrafts(text);
    expect(drafts.map((d) => d.front)).toEqual([
      "What is mitosis",
      "mitochondria",
    ]);
    const remainder = remainderAfterRules(text, drafts);
    expect(remainder).toContain("Giardia species - disease");
    expect(remainder).toContain("Phylum | Hosts | Family");
    expect(remainder).not.toContain("What is mitosis ::");
  });

  it("does not harvest lecture chrome via spaced double-colon", () => {
    const text = [
      "Giardia species :: disease",
      "lifecycle :: overview",
      "What is mitosis :: Cell division producing two identical nuclei",
    ].join("\n");
    const drafts = harvestRuleDrafts(text);
    expect(drafts.map((d) => d.front)).toEqual(["What is mitosis"]);
  });

  it("does not treat bare * in emphasis as a bullet prefix", () => {
    const drafts = harvestRuleDrafts(
      "*ATP* - adenosine triphosphate\n* real bullet - should skip",
    );
    expect(drafts.map((d) => d.front)).toEqual(["*ATP*"]);
    expect(drafts.map((d) => d.back)).toEqual(["adenosine triphosphate"]);
  });
});
