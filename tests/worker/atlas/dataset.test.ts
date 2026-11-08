import { describe, expect, it } from "vitest";
import {
  datasetEntrySchema,
  datasetGroupFileSchema,
  datasetKeyFor,
} from "../../../worker/atlas/datasets/schema";
import {
  HOST_TERMS,
  ORGAN_TERMS,
  hostCovers,
  organCovers,
  resolveHost,
  resolveOrgan,
} from "../../../worker/atlas/datasets/vocab";

const minimal = {
  key: "fasciola-hepatica",
  canonicalName: "Fasciola hepatica",
  fields: { group: "trematode" },
  refs: [
    {
      citation: "CDC DPDx: Fascioliasis",
      url: "https://www.cdc.gov/dpdx/fascioliasis/index.html",
    },
  ],
};

describe("dataset schema", () => {
  it("accepts a minimal entry and fills defaults", () => {
    const e = datasetEntrySchema.parse(minimal);
    expect(e.aliases).toEqual([]);
    expect(e.misspellings).toEqual([]);
    expect(e.images).toEqual([]);
    expect(e.fields.definitiveHosts).toEqual([]);
    expect(e.refs[0].field).toBeNull();
  });

  it("derives keys from canonical names", () => {
    expect(datasetKeyFor("Fasciola hepatica")).toBe("fasciola-hepatica");
    expect(datasetKeyFor("Eimeria spp.")).toBe("eimeria-spp");
  });

  it.each([
    [
      "unknown field key",
      { ...minimal, fields: { group: "trematode", hosts: [] } },
    ],
    ["unknown entry key", { ...minimal, extra: 1 }],
    ["key not derived from name", { ...minimal, key: "liver-fluke" }],
    [
      "non-canonical name",
      { ...minimal, key: "f-hepatica", canonicalName: "F. hepatica" },
    ],
    ["no refs", { ...minimal, refs: [] }],
    [
      "only field-level refs",
      { ...minimal, refs: [{ ...minimal.refs[0], field: "pppDays" }] },
    ],
    [
      "http ref",
      { ...minimal, refs: [{ ...minimal.refs[0], url: "http://example.org" }] },
    ],
    ["missing group", { ...minimal, fields: {} }],
    [
      "significance over 160 chars",
      {
        ...minimal,
        fields: { group: "trematode", significance: "x".repeat(161) },
      },
    ],
    [
      "misspelling of another taxon",
      { ...minimal, misspellings: ["Fasciolides magna"] },
    ],
  ])("rejects %s", (_label, input) => {
    expect(datasetEntrySchema.safeParse(input).success).toBe(false);
  });

  it("rejects a group file whose entry has another group", () => {
    const r = datasetGroupFileSchema.safeParse({
      group: "cestode",
      entries: [minimal],
    });
    expect(r.success).toBe(false);
  });
});

describe("vocabulary", () => {
  it("resolves aliases and scientific names", () => {
    expect(resolveHost("Canids")).toBe("canid");
    expect(resolveHost("galba truncatula")).toBe("Galba truncatula");
    expect(resolveOrgan("Pulmonary")).toBe("lungs");
  });

  it("covers narrower terms only", () => {
    expect(hostCovers("small ruminant", "sheep")).toBe(true);
    expect(hostCovers("sheep", "small ruminant")).toBe(false);
    expect(organCovers("liver", "bile ducts")).toBe(true);
  });

  it("only references terms that exist", () => {
    for (const terms of [HOST_TERMS, ORGAN_TERMS]) {
      for (const [k, v] of Object.entries(terms)) {
        for (const b of v.broader) {
          expect(Object.keys(terms), `${k} -> ${b}`).toContain(b);
        }
      }
    }
  });
});
