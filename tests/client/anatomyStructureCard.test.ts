import { describe, expect, it } from "vitest";
import {
  makeCardsStructureIds,
  structureToQaFields,
} from "../../src/anatomy/structure/structureCard";

describe("structureToQaFields", () => {
  it("uses label as front and summary + synonyms as back", () => {
    const fields = structureToQaFields(
      {
        id: "femur",
        label: "Femur",
        node: "Femur",
        info: {
          summary: "Thigh bone.",
          alsoKnownAs: ["Os femoris", "  "],
        },
      },
      "Canine",
    );
    expect(fields.front).toBe("Femur");
    expect(fields.back).toBe("Thigh bone.\n\nAlso known as: Os femoris");
  });

  it("falls back to scene title when info is empty", () => {
    const fields = structureToQaFields(
      { id: "x", label: "X", node: "X" },
      "Canine",
    );
    expect(fields).toEqual({ front: "X", back: "Canine" });
  });
});

describe("makeCardsStructureIds", () => {
  it("unions selected and revealed ids", () => {
    expect(
      makeCardsStructureIds("a", new Set(["b", "a"])).sort(),
    ).toEqual(["a", "b"]);
  });

  it("returns empty when nothing selected or solved", () => {
    expect(makeCardsStructureIds(null, new Set())).toEqual([]);
  });
});
