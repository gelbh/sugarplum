import { describe, expect, it } from "vitest";
import { partitionSplitSiblings } from "../../../src/materials/splitSiblingGroups";

type Row = {
  id: string;
  deck_id: string;
  kind: string;
  filename: string | null;
};

function row(
  overrides: Partial<Row> & Pick<Row, "id" | "filename">,
): Row {
  return {
    deck_id: "d1",
    kind: "pdf",
    ...overrides,
  };
}

describe("partitionSplitSiblings", () => {
  it("groups two-plus siblings under shared stem and sorts by index", () => {
    const materials = [
      row({ id: "b", filename: "Lecture (2/3).pdf" }),
      row({ id: "a", filename: "Lecture (1/3).pdf" }),
      row({ id: "c", filename: "Lecture (3/3).pdf" }),
    ];
    const out = partitionSplitSiblings(materials);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "group", stem: "Lecture" });
    if (out[0]?.type !== "group") throw new Error("expected group");
    expect(out[0].members.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("dissolves a lone part-shaped name to flat", () => {
    const out = partitionSplitSiblings([
      row({ id: "solo", filename: "Lecture (1/2).pdf" }),
      row({ id: "other", filename: "handout.pdf" }),
    ]);
    expect(out).toEqual([
      { type: "flat", material: expect.objectContaining({ id: "solo" }) },
      { type: "flat", material: expect.objectContaining({ id: "other" }) },
    ]);
  });

  it("does not merge across decks", () => {
    const out = partitionSplitSiblings([
      row({ id: "d1a", deck_id: "d1", filename: "Lecture (1/2).pdf" }),
      row({ id: "d2a", deck_id: "d2", filename: "Lecture (2/2).pdf" }),
    ]);
    expect(out.every((e) => e.type === "flat")).toBe(true);
  });

  it("groups incomplete sets that share stem", () => {
    const out = partitionSplitSiblings([
      row({ id: "p1", filename: "Lecture (1/3).pdf" }),
      row({ id: "p3", filename: "Lecture (3/3).pdf" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "group", stem: "Lecture" });
    if (out[0]?.type !== "group") throw new Error("expected group");
    expect(out[0].members.map((m) => m.id)).toEqual(["p1", "p3"]);
  });

  it("keeps pptx siblings separate from pdf of the same stem", () => {
    const out = partitionSplitSiblings([
      row({ id: "pdf1", kind: "pdf", filename: "Lecture (1/2).pdf" }),
      row({ id: "pdf2", kind: "pdf", filename: "Lecture (2/2).pdf" }),
      row({ id: "pptx1", kind: "pptx", filename: "Lecture (1/2).pptx" }),
      row({ id: "pptx2", kind: "pptx", filename: "Lecture (2/2).pptx" }),
    ]);
    const groups = out.filter((e) => e.type === "group");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => (g.type === "group" ? g.members[0]?.kind : null))).toEqual([
      "pdf",
      "pptx",
    ]);
  });

  it("does not merge parts with different totals under the same stem", () => {
    const out = partitionSplitSiblings([
      row({ id: "a", filename: "Lecture (1/2).pdf" }),
      row({ id: "b", filename: "Lecture (2/3).pdf" }),
      row({ id: "c", filename: "Lecture (3/3).pdf" }),
    ]);
    expect(out.map((e) => e.type)).toEqual(["flat", "group"]);
    expect(out[0]).toMatchObject({ type: "flat", material: { id: "a" } });
    if (out[1]?.type !== "group") throw new Error("expected group");
    expect(out[1].members.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("keeps duplicate part indexes flat", () => {
    const out = partitionSplitSiblings([
      row({ id: "a", filename: "Lecture (1/2).pdf" }),
      row({ id: "b", filename: "Lecture (1/2).pdf" }),
    ]);
    expect(out.every((e) => e.type === "flat")).toBe(true);
  });

  it("preserves first-seen order of flats and groups", () => {
    const out = partitionSplitSiblings([
      row({ id: "flat1", filename: "alpha.pdf" }),
      row({ id: "g2", filename: "Beta (2/2).pdf" }),
      row({ id: "flat2", filename: "gamma.pdf" }),
      row({ id: "g1", filename: "Beta (1/2).pdf" }),
    ]);
    expect(out.map((e) => e.type)).toEqual(["flat", "group", "flat"]);
    expect(out[0]).toMatchObject({ type: "flat", material: { id: "flat1" } });
    if (out[1]?.type !== "group") throw new Error("expected group");
    expect(out[1].members.map((m) => m.id)).toEqual(["g1", "g2"]);
    expect(out[2]).toMatchObject({ type: "flat", material: { id: "flat2" } });
  });
});
