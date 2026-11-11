import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { toEntryView } from "../../../worker/atlas/merge";
import manifest from "../../eval/atlas/course-taxa.json";

const parasitesDir = join(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "public/atlas/parasites",
);

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
  ])("rejects %s", (_label, input) => {
    expect(datasetEntrySchema.safeParse(input).success).toBe(false);
  });

  it("maps dataset image file to AtlasEntryView src", () => {
    const e = datasetEntrySchema.parse({
      ...minimal,
      images: [
        {
          id: "adult",
          file: "fasciola-hepatica-adult.webp",
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
        src: "/atlas/parasites/fasciola-hepatica-adult.webp",
        placeholderSrc: "/atlas/parasites/fasciola-hepatica-adult-blur.webp",
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
      dataset.entries.flatMap((e) =>
        e.misspellings.map((m) => m.split(" ")[0]),
      ),
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

  it("requires every dataset image file under public/atlas/parasites", () => {
    const missing = dataset.entries.flatMap((e) =>
      e.images.flatMap((img) => {
        const paths = [img.file];
        if (img.file.endsWith(".webp")) {
          paths.push(`${img.file.slice(0, -5)}-blur.webp`);
        }
        return paths
          .filter((file) => !existsSync(join(parasitesDir, file)))
          .map((file) => `${e.key}/${file}`);
      }),
    );
    expect(missing).toEqual([]);
  });

  it("requires credit and license on every dataset image", () => {
    const incomplete = dataset.entries.flatMap((e) =>
      e.images
        .filter((img) => !img.credit.trim() || !img.license.trim())
        .map((img) => `${e.key}/${img.id}`),
    );
    expect(incomplete).toEqual([]);
  });

  it("allows at most one hero image per entry", () => {
    const extras = dataset.entries
      .filter((e) => e.images.filter((img) => img.isHero).length > 1)
      .map((e) => e.key);
    expect(extras).toEqual([]);
  });

  it("ships pilot lifecycle_diagram images and never marks them hero", () => {
    const diagrams = dataset.entries.flatMap((e) =>
      e.images
        .filter((img) => img.role === "lifecycle_diagram")
        .map((img) => ({ key: e.key, id: img.id, isHero: img.isHero })),
    );
    expect(diagrams).toEqual(
      expect.arrayContaining([
        {
          key: "fasciola-hepatica",
          id: "fasciola-hepatica-lifecycle",
          isHero: false,
        },
        {
          key: "taenia-saginata",
          id: "taenia-saginata-lifecycle",
          isHero: false,
        },
      ]),
    );
    expect(diagrams.filter((d) => d.isHero)).toEqual([]);
  });

  it("marks exactly one infective stage on phase-1 enrichment pilots", () => {
    const pilots = {
      "fasciola-hepatica": "metacercaria",
      "haemonchus-contortus": "L3",
      "giardia-duodenalis": "cyst",
      "strongylus-vulgaris": "L3",
    } as const;
    for (const [key, stageName] of Object.entries(pilots)) {
      const entry = dataset.entries.find((e) => e.key === key);
      expect(entry, key).toBeDefined();
      const infective = (entry?.fields.lifecycleStages ?? []).filter(
        (s) => s.infective,
      );
      expect(infective, key).toHaveLength(1);
      expect(infective[0]?.name, key).toBe(stageName);
      expect(infective[0]?.transmission, key).toBeTruthy();
      expect(
        entry?.refs.some((r) => r.field === "lifecycleStages"),
        `${key} lifecycleStages ref`,
      ).toBe(true);
    }
  });

  it("marks exactly one infective stage on every trematode entry", () => {
    const expected = {
      "fasciola-hepatica": "metacercaria",
      "fasciola-gigantica": "metacercaria",
      "fascioloides-magna": "metacercaria",
      "dicrocoelium-dendriticum": "metacercaria",
      "calicophoron-daubneyi": "metacercaria",
      "paramphistomum-cervi": "metacercaria",
      "fasciolopsis-buski": "metacercaria",
      "clonorchis-sinensis": "metacercaria",
      "opisthorchis-felineus": "metacercaria",
      "schistosoma-spp": "cercaria",
    } as const;
    for (const [key, stageName] of Object.entries(expected)) {
      const entry = dataset.entries.find((e) => e.key === key);
      expect(entry, key).toBeDefined();
      const infective = (entry?.fields.lifecycleStages ?? []).filter(
        (s) => s.infective,
      );
      expect(infective, key).toHaveLength(1);
      expect(infective[0]?.name, key).toBe(stageName);
      expect(infective[0]?.transmission, key).toBeTruthy();
      expect(
        entry?.refs.some((r) => r.field === "lifecycleStages"),
        `${key} lifecycleStages ref`,
      ).toBe(true);
    }
  });

  it("marks exactly one infective stage on every cestode entry", () => {
    const expected = {
      "anoplocephala-perfoliata": "cysticercoid",
      "dipylidium-caninum": "cysticercoid",
      "davainea-proglottina": "cysticercoid",
      "raillietina-spp": "cysticercoid",
      "moniezia-expansa": "cysticercoid",
      "taenia-hydatigena": "cysticercus",
      "taenia-ovis": "cysticercus",
      "taenia-multiceps": "coenurus",
      "taenia-saginata": "cysticercus",
      "taenia-solium": "cysticercus",
      "echinococcus-granulosus": "hydatid cyst",
      "echinococcus-multilocularis": "hydatid cyst",
      "diphyllobothrium-latum": "plerocercoid",
    } as const;
    const cestodeKeys = dataset.entries
      .filter((e) => e.fields.group === "cestode")
      .map((e) => e.key)
      .sort();
    expect(cestodeKeys).toEqual(Object.keys(expected).sort());
    for (const [key, stageName] of Object.entries(expected)) {
      const entry = dataset.entries.find((e) => e.key === key);
      expect(entry, key).toBeDefined();
      const infective = (entry?.fields.lifecycleStages ?? []).filter(
        (s) => s.infective,
      );
      expect(infective, key).toHaveLength(1);
      expect(infective[0]?.name, key).toBe(stageName);
      expect(infective[0]?.transmission, key).toBeTruthy();
      expect(
        entry?.refs.some((r) => r.field === "lifecycleStages"),
        `${key} lifecycleStages ref`,
      ).toBe(true);
    }
  });
});
