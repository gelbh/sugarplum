import { describe, expect, it } from "vitest";
import { entryTitles } from "../../src/atlas/entryTitles";

describe("entryTitles", () => {
  it("uses common name as primary when present", () => {
    expect(
      entryTitles({
        commonName: "Common liver fluke",
        canonicalName: "Fasciola hepatica",
      }),
    ).toEqual({
      primary: "Common liver fluke",
      scientific: "Fasciola hepatica",
    });
  });

  it("falls back to canonical when commonName is null", () => {
    expect(
      entryTitles({
        commonName: null,
        canonicalName: "Fasciola hepatica",
      }),
    ).toEqual({
      primary: "Fasciola hepatica",
      scientific: "Fasciola hepatica",
    });
  });

  it("trims whitespace and treats empty as missing", () => {
    expect(
      entryTitles({
        commonName: "  ",
        canonicalName: "Fasciola hepatica",
      }),
    ).toEqual({
      primary: "Fasciola hepatica",
      scientific: "Fasciola hepatica",
    });
  });
});
