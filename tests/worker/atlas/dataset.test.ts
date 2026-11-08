import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  datasetEntrySchema,
  datasetGroupFileSchema,
  datasetKeyFor,
} from "../../../worker/atlas/datasets/schema";
import {
  loadGroupFiles,
  loadParasiteDataset,
  RAW_FILES_FOR_TESTS,
} from "../../../worker/atlas/datasets/parasites";
import {
  HOST_TERMS,
  ORGAN_TERMS,
  hostCovers,
  organCovers,
  resolveHost,
  resolveOrgan,
} from "../../../worker/atlas/datasets/vocab";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../eval/atlas/course-taxa.json", import.meta.url),
    "utf8",
  ),
) as { taxa: { canonicalName: string; file: string }[] };

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

describe("built-in parasite dataset", () => {
  const dataset = loadParasiteDataset();
  const files = loadGroupFiles();

  it("has unique keys", () => {
    const keys = dataset.entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses every name (canonical, common, alias, misspelling) for one entry only", () => {
    const owner = new Map<string, string>();
    for (const e of dataset.entries) {
      const names = [
        e.canonicalName,
        e.commonName,
        ...e.aliases,
        ...e.misspellings,
      ]
        .filter((n): n is string => n !== null)
        .map((n) => n.toLowerCase());
      for (const n of new Set(names)) {
        expect(
          owner.get(n) ?? e.key,
          `${n} is used by ${owner.get(n)} and ${e.key}`,
        ).toBe(e.key);
        owner.set(n, e.key);
      }
    }
  });

  it("uses vocabulary terms for hosts and organs", () => {
    for (const e of dataset.entries) {
      const f = e.fields;
      for (const h of [
        ...f.definitiveHosts,
        ...f.intermediateHosts,
        ...f.paratenicHosts,
      ]) {
        expect(Object.hasOwn(HOST_TERMS, h), `${e.key}: host "${h}"`).toBe(
          true,
        );
      }
      if (f.majorOrgan !== null) {
        expect(
          Object.hasOwn(ORGAN_TERMS, f.majorOrgan),
          `${e.key}: organ "${f.majorOrgan}"`,
        ).toBe(true);
      }
    }
  });

  it("lists every authored entry in the course manifest", () => {
    const listed = new Set(manifest.taxa.map((t) => t.canonicalName));
    for (const e of dataset.entries)
      expect(listed.has(e.canonicalName), e.canonicalName).toBe(true);
  });

  it.each(files.map((f) => [f.file, f] as const))(
    "%s covers every manifest taxon assigned to it",
    (file, f) => {
      const authored = new Set(f.entries.map((e) => e.canonicalName));
      const missing = manifest.taxa
        .filter((t) => t.file === file && !authored.has(t.canonicalName))
        .map((t) => t.canonicalName);
      expect(missing).toEqual([]);
    },
  );

  // Nested stage and test objects are not strict in parasiteFieldsSchema, so a
  // typo such as windowStartWeeks would be stripped silently.
  it("drops no keys anywhere in the raw JSON", () => {
    const paths = (v: unknown, p = ""): string[] =>
      Array.isArray(v)
        ? v.flatMap((x, i) => paths(x, `${p}[${i}]`))
        : v !== null && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) => [
              `${p}.${k}`,
              ...paths(x, `${p}.${k}`),
            ])
          : [];
    for (const [file, raw] of Object.entries(RAW_FILES_FOR_TESTS)) {
      const parsed = new Set(paths(datasetGroupFileSchema.parse(raw)));
      const dropped = paths(raw).filter((p) => !parsed.has(p));
      expect(dropped, file).toEqual([]);
    }
  });

  it("ships no images before step 2", () => {
    expect(dataset.entries.flatMap((e) => e.images)).toEqual([]);
  });
});
