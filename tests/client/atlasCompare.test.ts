import { describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/hub/bundledSource";
import { compareRows, type CompareRowKey } from "../../src/atlas/compare/compare";
import { atlasCompareHref, matchAtlasPath } from "../../src/atlas/paths";

const entries = await bundledAtlasSource.list("subj_1");
const byId = (id: string) => entries.find((e) => e.id === id)!;
const differing = (rows: ReturnType<typeof compareRows>) =>
  rows.filter((r) => r.differs).map((r) => r.key);

describe("compareRows", () => {
  const fasciola = byId("fasciola-hepatica");
  const calicophoron = byId("calicophoron-daubneyi");
  const rows = compareRows(fasciola, calicophoron);

  it("returns the rows in display order", () => {
    expect(rows.map((r) => r.key)).toEqual<CompareRowKey[]>([
      "group",
      "family",
      "definitiveHosts",
      "intermediateHosts",
      "site",
      "zoonotic",
      "ppp",
      "lifecycleType",
      "diagnosticStage",
      "tests",
    ]);
  });

  it("separates Fasciola hepatica from Calicophoron daubneyi on site and intermediate hosts", () => {
    const diff = differing(rows);
    expect(diff).toContain("site");
    expect(diff).toContain("intermediateHosts");
    expect(diff).not.toContain("group");
    expect(diff).not.toContain("lifecycleType");
    expect(diff).not.toContain("diagnosticStage");
  });

  it("styles host lists as taxa but never test names", () => {
    const taxa = Object.fromEntries(
      rows.map((r) => [r.key, r.a.kind === "list" ? r.a.taxa : null]),
    );
    expect(taxa.intermediateHosts).toBe(true);
    expect(taxa.tests).toBe(false);
  });

  it("finds nothing different when an entry meets itself", () => {
    expect(differing(compareRows(fasciola, fasciola))).toEqual([]);
  });

  it("compares host and test lists as sets", () => {
    const shuffled = {
      ...fasciola,
      fields: {
        ...fasciola.fields,
        definitiveHosts: [...fasciola.fields.definitiveHosts].reverse(),
        intermediateHosts: [
          ...fasciola.fields.intermediateHosts,
          fasciola.fields.intermediateHosts[0],
        ],
        diagnosticTests: [...fasciola.fields.diagnosticTests].reverse(),
      },
    };
    expect(differing(compareRows(fasciola, shuffled))).toEqual([]);
  });

  it("treats a missing value on one side as a difference", () => {
    const unknown = {
      ...fasciola,
      fields: { ...fasciola.fields, zoonotic: null, pppDays: null },
    };
    expect(differing(compareRows(fasciola, unknown))).toEqual([
      "zoonotic",
      "ppp",
    ]);
    expect(differing(compareRows(unknown, unknown))).toEqual([]);
  });
});

describe("atlasCompareHref", () => {
  it("round-trips encoded keys through matchAtlasPath", () => {
    const href = atlasCompareHref("s 1", "a/b", "c d");
    expect(matchAtlasPath(href)).toEqual({
      kind: "atlas",
      atlasId: "s 1",
      route: { kind: "compare", a: "a/b", b: "c d" },
    });
  });
});
