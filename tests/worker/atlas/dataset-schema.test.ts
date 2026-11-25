import { describe, expect, it } from "vitest";
import {
  datasetEntrySchema,
  datasetGroupFileSchema,
  datasetKeyFor,
  parasiteDatasetSchema,
} from "../../../worker/atlas/datasets/schema";
import { toEntryView } from "../../../worker/atlas/merge";

const minimal = {
  key: "fasciola-hepatica",
  canonicalName: "Fasciola hepatica",
  commonName: "Common liver fluke",
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
    expect(e.commonName).toBe("Common liver fluke");
    expect(e.aliases).toEqual([]);
    expect(e.misspellings).toEqual([]);
    expect(e.images).toEqual([]);
    expect(e.fields.definitiveHosts).toEqual([]);
    expect(e.refs[0].field).toBeNull();
  });

  it("rejects null commonName", () => {
    expect(() =>
      datasetEntrySchema.parse({ ...minimal, commonName: null }),
    ).toThrow();
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
      "two diagnostic stages",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [
            { name: "egg", hostRole: "environment", diagnostic: true },
            { name: "adult", hostRole: "definitive", diagnostic: true },
          ],
          definitiveHosts: ["sheep"],
        },
        refs: [
          ...minimal.refs,
          {
            field: "lifecycleStages",
            citation: "CDC DPDx: Fascioliasis",
            url: "https://www.cdc.gov/dpdx/fascioliasis/index.html",
          },
        ],
      },
    ],
    [
      "infective without lifecycleStages ref",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [
            {
              name: "metacercaria",
              hostRole: "environment",
              infective: true,
            },
          ],
        },
      },
    ],
    [
      "stage imageId missing from images",
      {
        ...minimal,
        fields: {
          group: "trematode",
          lifecycleStages: [
            {
              name: "egg",
              hostRole: "environment",
              imageId: "missing-img",
            },
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
    [
      "two hero images",
      {
        ...minimal,
        images: [
          {
            id: "adult",
            file: "adult.webp",
            role: "adult",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "https://example.org/adult.jpg",
            isHero: true,
          },
          {
            id: "egg",
            file: "egg.webp",
            role: "egg_oocyst",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "https://example.org/egg.jpg",
            isHero: true,
          },
        ],
      },
    ],
    [
      "lifecycle_diagram as hero",
      {
        ...minimal,
        images: [
          {
            id: "lifecycle",
            file: "lifecycle.webp",
            role: "lifecycle_diagram",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "https://example.org/lifecycle.png",
            isHero: true,
          },
        ],
      },
    ],
    [
      "duplicate image ids",
      {
        ...minimal,
        images: [
          {
            id: "adult",
            file: "adult.webp",
            role: "adult",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "https://example.org/adult.jpg",
          },
          {
            id: "adult",
            file: "adult-2.webp",
            role: "adult",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "https://example.org/adult-2.jpg",
          },
        ],
      },
    ],
    [
      "nested image file path",
      {
        ...minimal,
        images: [
          {
            id: "hero",
            file: "fasciola-hepatica/hero.webp",
            role: "adult",
            credit: "CDC",
            license: "Public domain",
            sourceUrl: "https://example.org/hero.jpg",
            isHero: true,
          },
        ],
      },
    ],
  ])("rejects %s", (_label, input) => {
    expect(datasetEntrySchema.safeParse(input).success).toBe(false);
  });

  it("maps dataset image file to AtlasEntryView src", () => {
    const e = datasetEntrySchema.parse({
      ...minimal,
      images: [
        {
          id: "adult",
          file: "hero.webp",
          role: "adult",
          credit: "CDC / DPDx",
          license: "Public domain",
          sourceUrl: "https://www.cdc.gov/dpdx/fascioliasis/index.html",
          isHero: true,
        },
      ],
    });
    expect(toEntryView(e).images).toEqual([
      {
        id: "adult",
        src: "/atlas/parasites/fasciola-hepatica/hero.webp",
        placeholderSrc: "/atlas/parasites/fasciola-hepatica/hero-blur.webp",
        role: "adult",
        caption: null,
        credit: "CDC / DPDx",
        license: "Public domain",
        sourceUrl: "https://www.cdc.gov/dpdx/fascioliasis/index.html",
        isHero: true,
      },
    ]);
  });

  it("accepts vocabulary hosts, organs and nested objects", () => {
    const r = datasetEntrySchema.safeParse({
      ...minimal,
      refs: [
        ...minimal.refs,
        { ...minimal.refs[0], field: "pppDays" },
        { ...minimal.refs[0], field: "lifecycleStages" },
      ],
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
    commonName: "Large American fluke",
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
