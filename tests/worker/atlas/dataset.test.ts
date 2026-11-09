import { describe, expect, it } from "vitest";
import {
  datasetEntrySchema,
  datasetGroupFileSchema,
  datasetKeyFor,
  parasiteDatasetSchema,
} from "../../../worker/atlas/datasets/schema";
import {
  loadGroupFiles,
  loadParasiteDataset,
} from "../../../worker/atlas/datasets/parasites";
import {
  HOST_TERMS,
  ORGAN_TERMS,
  hostCovers,
  organCovers,
} from "../../../worker/atlas/datasets/vocab";
import manifest from "../../eval/atlas/course-taxa.json";

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
    [
      "unknown host term",
      {
        ...minimal,
        fields: { group: "trematode", definitiveHosts: ["sheeps"] },
      },
    ],
    [
      "inherited property as host",
      {
        ...minimal,
        fields: { group: "trematode", intermediateHosts: ["constructor"] },
      },
    ],
    [
      "unknown organ term",
      { ...minimal, fields: { group: "trematode", majorOrgan: "hepatic" } },
    ],
    [
      "unknown key in a lifecycle stage",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [{ name: "egg", locaton: "faeces" }],
        },
      },
    ],
    [
      "duration without a host role",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [
            { name: "egg", durationDays: { min: 14, max: 14 } },
          ],
        },
      },
    ],
    [
      "duration ending before it starts",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [
            {
              name: "egg",
              hostRole: "environment",
              durationDays: { min: 14, max: 7 },
            },
          ],
        },
      },
    ],
    [
      "unknown stage host term",
      {
        ...minimal,
        fields: {
          group: "trematode",
          intermediateHosts: ["snail"],
          lifecycleStages: [
            { name: "redia", hostRole: "intermediate", host: "slime" },
          ],
        },
      },
    ],
    [
      "stage host without a host role",
      {
        ...minimal,
        fields: {
          group: "trematode",
          intermediateHosts: ["snail"],
          lifecycleStages: [{ name: "redia", host: "snail" }],
        },
      },
    ],
    [
      "stage host in the environment",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [
            { name: "egg", hostRole: "environment", host: "snail" },
          ],
        },
      },
    ],
    [
      "host role with no hosts listed",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [{ name: "redia", hostRole: "intermediate" }],
        },
      },
    ],
    [
      "stage host outside the role list",
      {
        ...minimal,
        fields: {
          group: "trematode",
          intermediateHosts: ["Galba truncatula"],
          lifecycleStages: [
            { name: "redia", hostRole: "intermediate", host: "ant" },
          ],
        },
      },
    ],
    [
      "unknown key in a diagnostic test",
      {
        ...minimal,
        fields: {
          group: "trematode",
          diagnosticTests: [{ name: "FEC", windowStartWeeks: 2 }],
        },
      },
    ],
    [
      "diagnostic window ending before it starts",
      {
        ...minimal,
        fields: {
          group: "trematode",
          diagnosticTests: [
            { name: "FEC", windowStartWeek: 4, windowEndWeek: 2 },
          ],
        },
      },
    ],
    [
      "unknown key in pppDays",
      {
        ...minimal,
        fields: { group: "trematode", pppDays: { min: 1, max: 2, maxx: 3 } },
      },
    ],
    [
      "unknown ref field",
      {
        ...minimal,
        refs: [...minimal.refs, { ...minimal.refs[0], field: "hosts" }],
      },
    ],
    [
      "http image source",
      {
        ...minimal,
        images: [
          {
            id: "adult",
            file: "adult.webp",
            role: "adult",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "http://example.org/adult.jpg",
          },
        ],
      },
    ],
  ])("rejects %s", (_label, input) => {
    expect(datasetEntrySchema.safeParse(input).success).toBe(false);
  });

  it("accepts vocabulary hosts, organs and nested objects", () => {
    const r = datasetEntrySchema.safeParse({
      ...minimal,
      refs: [...minimal.refs, { ...minimal.refs[0], field: "pppDays" }],
      fields: {
        group: "trematode",
        definitiveHosts: ["sheep"],
        intermediateHosts: ["Galba truncatula"],
        majorOrgan: "bile ducts",
        pppDays: { min: 56, max: 70 },
        lifecycleStages: [
          {
            name: "egg",
            location: "faeces",
            hostRole: "environment",
            durationDays: { min: 14, max: 14 },
          },
          { name: "redia", hostRole: "intermediate", host: "Galba truncatula" },
          { name: "adult fluke", hostRole: "definitive" },
        ],
        diagnosticTests: [{ name: "FEC", windowStartWeek: 8 }],
      },
    });
    expect(r.error).toBeUndefined();
  });

  it("rejects a group file whose entry has another group", () => {
    const r = datasetGroupFileSchema.safeParse({
      group: "cestode",
      entries: [minimal],
    });
    expect(r.success).toBe(false);
  });

  const magna = {
    ...minimal,
    key: "fascioloides-magna",
    canonicalName: "Fascioloides magna",
  };
  const dataset = (...groups: unknown[][]) => ({
    version: 1,
    groups: groups.map((entries) => ({ group: "trematode", entries })),
  });

  it("flattens group files into one entry list", () => {
    const d = parasiteDatasetSchema.parse(dataset([minimal], [magna]));
    expect(d.entries.map((e) => e.key)).toEqual([
      "fasciola-hepatica",
      "fascioloides-magna",
    ]);
  });

  it("allows an entry to repeat its own name", () => {
    const r = parasiteDatasetSchema.safeParse(
      dataset([{ ...minimal, aliases: ["fasciola hepatica"] }]),
    );
    expect(r.error).toBeUndefined();
  });

  it.each([
    ["a duplicate key across files", dataset([minimal], [minimal])],
    [
      "an alias owned by two entries",
      dataset([
        { ...minimal, aliases: ["Liver fluke"] },
        { ...magna, aliases: ["liver fluke"] },
      ]),
    ],
    [
      "a common name that is another entry's canonical name",
      dataset([minimal, { ...magna, commonName: "Fasciola hepatica" }]),
    ],
  ])("rejects a dataset with %s", (_label, input) => {
    expect(parasiteDatasetSchema.safeParse(input).success).toBe(false);
  });
});

describe("vocabulary", () => {
  it("covers narrower terms only", () => {
    expect(hostCovers("small ruminant", "sheep")).toBe(true);
    expect(hostCovers("sheep", "small ruminant")).toBe(false);
    expect(organCovers("liver", "bile ducts")).toBe(true);
  });

  it("has no cycles in the broader graph", () => {
    for (const terms of [HOST_TERMS, ORGAN_TERMS]) {
      const state = new Map<string, "open" | "done">();
      const visit = (k: string, path: string[]) => {
        expect(state.get(k), `cycle: ${[...path, k].join(" -> ")}`).not.toBe(
          "open",
        );
        if (state.get(k) === "done") return;
        state.set(k, "open");
        for (const b of terms[k]?.broader ?? []) visit(b, [...path, k]);
        state.set(k, "done");
      };
      for (const k of Object.keys(terms)) visit(k, []);
    }
  });
});

describe("built-in parasite dataset", () => {
  const dataset = loadParasiteDataset();
  const files = loadGroupFiles();

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

  it("authors every manifest file", () => {
    const authored = new Set(files.map((f) => f.file));
    expect(
      [...new Set(manifest.taxa.map((t) => t.file))].filter(
        (f) => !authored.has(f),
      ),
    ).toEqual([]);
  });

  it("records every known slide misspelling on its entry", async () => {
    const { KNOWN_MISSPELLINGS } = await import("../../../worker/atlas/names");
    const all = new Set(
      dataset.entries.flatMap((e) => e.misspellings.map((m) => m.split(" ")[0])),
    );
    for (const genus of KNOWN_MISSPELLINGS)
      expect(all.has(genus), genus).toBe(true);
  });

  it("places each family in one order and phylum", () => {
    const seen = new Map<string, string>();
    for (const { fields: f } of dataset.entries) {
      if (!f.family) continue;
      const rank = `${f.phylum} > ${f.order}`;
      expect(seen.get(f.family) ?? rank, f.family).toBe(rank);
      seen.set(f.family, rank);
    }
  });

  it("gives every lifecycle stage a host role", () => {
    const missing = dataset.entries.flatMap((e) =>
      e.fields.lifecycleStages
        .filter((s) => s.hostRole === null)
        .map((s) => `${e.key}: ${s.name}`),
    );
    expect(missing).toEqual([]);
  });

  it("names a lifecycle stage in every onHostStages value", () => {
    const stray = dataset.entries.flatMap((e) => {
      const names = new Set(e.fields.lifecycleStages.map((s) => s.name));
      if (names.size === 0) return [];
      return e.fields.onHostStages
        .filter((s) => !names.has(s))
        .map((s) => `${e.key}: ${s}`);
    });
    expect(stray).toEqual([]);
  });

  it("ships no images before step 2", () => {
    expect(dataset.entries.flatMap((e) => e.images)).toEqual([]);
  });
});
