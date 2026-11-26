import { describe, expect, it } from "vitest";
import { entryTitles } from "../../../../src/atlas/lib/entryTitles";

describe("entryTitles", () => {
  it("uses common name as primary with scientific subtitle", () => {
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

  it("omits scientific when commonName is missing", () => {
    expect(
      entryTitles({
        commonName: null,
        canonicalName: "Fasciola hepatica",
      }),
    ).toEqual({
      primary: "Fasciola hepatica",
      scientific: null,
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
      scientific: null,
    });
  });

  it("omits scientific when common equals canonical", () => {
    expect(
      entryTitles({
        commonName: "Fasciola hepatica",
        canonicalName: "Fasciola hepatica",
      }),
    ).toEqual({
      primary: "Fasciola hepatica",
      scientific: null,
    });
  });
});
