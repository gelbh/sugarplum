import { describe, expect, it } from "vitest";
import {
  buildAtlasMakeCardsExtrasSource,
  buildAtlasMakeCardsSource,
  parseAtlasJobProvenance,
} from "../../../worker/atlas/makeCardsSource";
import { withAtlasProvenance } from "../../../worker/generation/gap-fill";
import type { CardDraft } from "../../../worker/generation/schema";
import type { DatasetEntry } from "../../../worker/atlas/datasets/schema";

const toxocaraFields: DatasetEntry["fields"] = {
  phylum: "Nematoda",
  order: null,
  family: "Ascarididae",
  group: "nematode",
  definitiveHosts: ["dog"],
  intermediateHosts: [],
  paratenicHosts: ["human"],
  vectorRole: null,
  majorOrgan: "small intestine",
  onHostStages: [],
  zoonotic: "yes",
  distribution: "worldwide",
  significance: "zoonosis",
  lifecycleType: "direct",
  pppDays: null,
  lifecycleStages: [
    {
      name: "egg",
      location: null,
      hostRole: "environment",
      host: null,
      durationDays: { min: 10, max: 14 },
      infective: true,
      diagnostic: false,
      transmission: "oral",
      note: null,
      imageId: null,
    },
  ],
  diagnosticStage: "egg",
  diagnosticTests: [
    {
      name: "fecal flotation",
      sample: "feces",
      windowStartWeek: 4,
      windowEndWeek: 8,
    },
  ],
};

const toxocaraRefs = [
  {
    field: "definitiveHosts",
    citation: "WCVM notes",
    url: null,
    note: null,
  },
];

describe("buildAtlasMakeCardsSource", () => {
  it("includes hosts, family, lifecycle, diagnostics, and citations", () => {
    const source = buildAtlasMakeCardsSource({
      entryKey: "toxocara-canis",
      canonicalName: "Toxocara canis",
      commonName: "Dog roundworm",
      aliases: ["T. canis"],
      fields: toxocaraFields,
      refs: toxocaraRefs,
    });

    expect(source.entryKey).toBe("toxocara-canis");
    expect(source.text).toContain("Toxocara canis");
    expect(source.text).toContain("Family: Ascarididae");
    expect(source.text).toContain("Definitive hosts: dog");
    expect(source.text).toContain("Lifecycle order:");
    expect(source.text).toContain("fecal flotation");
    expect(source.citations).toEqual(["WCVM notes"]);
    expect(source.topicHints[0]).toBe("Toxocara canis");
  });
});

describe("buildAtlasMakeCardsExtrasSource", () => {
  it("omits covered field lines and keeps leftover lifecycle/diagnostics/significance", () => {
    const source = buildAtlasMakeCardsExtrasSource({
      entryKey: "toxocara-canis",
      canonicalName: "Toxocara canis",
      commonName: "Dog roundworm",
      aliases: ["T. canis"],
      fields: toxocaraFields,
      refs: toxocaraRefs,
      coveredFieldKeys: [
        "commonName",
        "family",
        "group",
        "definitiveHosts",
        "paratenicHosts",
        "majorOrgan",
        "zoonotic",
        "distribution",
        "diagnosticStage",
      ],
    });

    expect(source.entryKey).toBe("toxocara-canis");
    expect(source.text).not.toContain("Major organ:");
    expect(source.text).not.toContain("Definitive hosts:");
    expect(source.text).not.toContain("Family:");
    expect(source.text).toContain("Lifecycle order:");
    expect(source.text).toContain("fecal flotation");
    expect(source.text).toContain("Significance: zoonosis");
    expect(source.text.toLowerCase()).not.toMatch(
      /cover(?:ing)?\s+hosts(?:\/family)?/,
    );
    expect(source.citations).toEqual(["WCVM notes"]);
  });

  it("returns empty text when only covered fields remain", () => {
    const source = buildAtlasMakeCardsExtrasSource({
      entryKey: "toxocara-canis",
      canonicalName: "Toxocara canis",
      commonName: "Dog roundworm",
      aliases: ["T. canis"],
      fields: {
        ...toxocaraFields,
        significance: null,
        lifecycleStages: [],
        diagnosticTests: [],
        phylum: null,
        order: null,
      },
      refs: toxocaraRefs,
      coveredFieldKeys: [
        "commonName",
        "family",
        "group",
        "definitiveHosts",
        "paratenicHosts",
        "majorOrgan",
        "zoonotic",
        "distribution",
        "diagnosticStage",
      ],
    });

    expect(source.text.trim()).toBe("");
  });
});

describe("atlas provenance helpers", () => {
  it("parses job provenance json", () => {
    expect(
      parseAtlasJobProvenance(
        JSON.stringify({
          atlasEntryId: "toxocara-canis",
          citations: ["WCVM notes"],
        }),
      ),
    ).toEqual({
      atlasEntryId: "toxocara-canis",
      citations: ["WCVM notes"],
    });
    expect(
      parseAtlasJobProvenance(
        JSON.stringify({
          atlasEntryId: "toxocara-canis",
          citations: [],
          hasExtras: false,
        }),
      ),
    ).toEqual({
      atlasEntryId: "toxocara-canis",
      citations: [],
      hasExtras: false,
    });
    expect(
      parseAtlasJobProvenance(
        JSON.stringify({
          atlasEntryId: "toxocara-canis",
          citations: [],
          hasExtras: true,
          atlasId: "atlas-xyz",
        }),
      ),
    ).toEqual({
      atlasEntryId: "toxocara-canis",
      citations: [],
      hasExtras: true,
      atlasId: "atlas-xyz",
    });
  });

  it("rewrites draft provenance for atlas jobs", () => {
    const drafts = [
      {
        type: "qa",
        front: "Host?",
        back: "dog",
        provenance: { pages: [1], excerpt: "dog" },
      },
    ] as CardDraft[];
    const next = withAtlasProvenance(drafts, {
      atlasEntryId: "toxocara-canis",
      citations: ["WCVM notes"],
    });
    expect(next[0]?.provenance).toEqual({
      pages: [1],
      excerpt: "dog",
      atlasEntryId: "toxocara-canis",
      citations: ["WCVM notes"],
    });
  });
});
