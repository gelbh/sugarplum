import { describe, expect, it } from "vitest";
import {
  mergeOverlayFields,
  overlayAtlas,
  sameFieldValue,
  toEntryView,
} from "../../../worker/atlas/merge";
import { enrichEntriesWithFocus } from "../../../worker/atlas/focus";
import type { DatasetEntry } from "../../../worker/atlas/datasets/schema";
import {
  emptyParasiteFields,
  lifecycleStageSchema,
} from "../../../worker/atlas/templates/parasite";
import { datasetEntry, overlayRow } from "./merge-fixtures";

describe("overlayAtlas", () => {
  const fasciola = datasetEntry({
    key: "fasciola-hepatica",
    canonicalName: "Fasciola hepatica",
    commonName: "Liver fluke",
    fields: {
      ...emptyParasiteFields(),
      group: "trematode",
      family: "Fasciolidae",
    },
  });
  const toxocara = datasetEntry({
    key: "toxocara-canis",
    canonicalName: "Toxocara canis",
    commonName: "Canine roundworm",
  });

  it("passes unedited dataset entries through with dataset key as id", () => {
    const views = overlayAtlas([fasciola, toxocara], []);
    expect(views).toEqual([toEntryView(fasciola), toEntryView(toxocara)]);
    expect(views[0].id).toBe("fasciola-hepatica");
    expect(views[0].editedAt).toBeNull();
  });

  it("hides soft-deleted origin keys", () => {
    const views = overlayAtlas(
      [fasciola, toxocara],
      [
        overlayRow({
          id: "row-del",
          origin_key: "fasciola-hepatica",
          canonical_name: "Fasciola hepatica",
          deleted_at: "2026-11-09T13:00:00.000Z",
          edited_at: null,
        }),
      ],
    );
    expect(views.map((v) => v.originKey)).toEqual(["toxocara-canis"]);
  });

  it("overrides commonName and fields for edited origin keys", () => {
    const views = overlayAtlas(
      [fasciola, toxocara],
      [
        overlayRow({
          id: "row-edit",
          origin_key: "fasciola-hepatica",
          origin_version: 1,
          canonical_name: "Fasciola hepatica",
          common_name: "Sheep liver fluke",
          fields_json: JSON.stringify({
            ...emptyParasiteFields(),
            group: "trematode",
            family: "Editedidae",
          }),
        }),
      ],
    );
    expect(views).toHaveLength(2);
    const edited = views.find((v) => v.originKey === "fasciola-hepatica")!;
    expect(edited.id).toBe("row-edit");
    expect(edited.commonName).toBe("Sheep liver fluke");
    expect(edited.fields.family).toBe("Editedidae");
    expect(edited.fields.group).toBe("trematode");
    expect(edited.editedAt).toBe("2026-11-09T12:00:00.000Z");
    expect(edited.refs).toEqual(fasciola.refs);
    expect(views.find((v) => v.originKey === "toxocara-canis")!.id).toBe(
      "toxocara-canis",
    );
  });

  it("inherits dataset commonName when overlay common_name is null", () => {
    const views = overlayAtlas(
      [fasciola],
      [
        overlayRow({
          id: "row-stale",
          origin_key: "fasciola-hepatica",
          origin_version: 1,
          canonical_name: "Fasciola hepatica",
          common_name: null,
          fields_json: JSON.stringify({
            ...emptyParasiteFields(),
            group: "trematode",
            family: "Editedidae",
          }),
        }),
      ],
    );
    const edited = views.find((v) => v.originKey === "fasciola-hepatica")!;
    expect(edited.commonName).toBe("Liver fluke");
    expect(edited.fields.family).toBe("Editedidae");
  });

  it("concats learner refs/images after dataset refs/images", () => {
    const withImage = datasetEntry({
      key: "fasciola-hepatica",
      canonicalName: "Fasciola hepatica",
      fields: {
        ...emptyParasiteFields(),
        group: "trematode",
      },
      images: [
        {
          id: "ds-img",
          file: "hero.webp",
          role: "adult",
          caption: null,
          credit: "CDC",
          license: "Public Domain",
          sourceUrl: "https://example.com/ds",
          isHero: true,
        },
      ],
    });
    const views = overlayAtlas(
      [withImage],
      [
        overlayRow({
          id: "row-edit",
          origin_key: "fasciola-hepatica",
          canonical_name: "Fasciola hepatica",
          refs: [
            {
              field: "family",
              citation: "Learner note",
              url: null,
              note: null,
            },
          ],
          images: [
            {
              id: "hero",
              src: "https://cdn.example/hero.webp",
              role: "adult",
              caption: null,
              credit: "me",
              license: "CC0",
              sourceUrl: "https://example.com/img",
              isHero: true,
            },
          ],
        }),
      ],
    );
    expect(views[0].refs).toEqual([
      ...withImage.refs,
      { field: "family", citation: "Learner note", url: null, note: null },
    ]);
    expect(views[0].images.map((i) => i.src)).toEqual([
      "/atlas/parasites/fasciola-hepatica/hero.webp",
      "https://cdn.example/hero.webp",
    ]);
    expect(views[0].images[0].placeholderSrc).toBe(
      "/atlas/parasites/fasciola-hepatica/hero-blur.webp",
    );
    expect(views[0].images[1].placeholderSrc).toBeUndefined();
  });

  it("appends learner-added rows with null originKey", () => {
    const views = overlayAtlas(
      [toxocara],
      [
        overlayRow({
          id: "row-add",
          origin_key: null,
          canonical_name: "My custom parasite",
          common_name: "Custom",
          fields_json: JSON.stringify({
            ...emptyParasiteFields(),
            group: "protozoan",
          }),
        }),
      ],
    );
    expect(views).toHaveLength(2);
    expect(views[0]).toEqual(toEntryView(toxocara));
    expect(views[1]).toMatchObject({
      id: "row-add",
      originKey: null,
      canonicalName: "My custom parasite",
      commonName: "Custom",
      fields: { group: "protozoan" },
      aliases: [],
      refs: [],
      images: [],
    });
  });

  it("omits soft-deleted learner-added rows", () => {
    const views = overlayAtlas(
      [],
      [
        overlayRow({
          id: "row-add",
          origin_key: null,
          canonical_name: "Gone",
          deleted_at: "2026-11-09T14:00:00.000Z",
        }),
      ],
    );
    expect(views).toEqual([]);
  });

  it("keeps an edited origin row when the dataset entry is missing", () => {
    const views = overlayAtlas(
      [],
      [
        overlayRow({
          id: "row-orphan",
          origin_key: "missing-key",
          canonical_name: "Orphan parasite",
          common_name: "Orphan",
        }),
      ],
    );
    expect(views).toEqual([
      expect.objectContaining({
        id: "row-orphan",
        originKey: "missing-key",
        canonicalName: "Orphan parasite",
        commonName: "Orphan",
        aliases: [],
      }),
    ]);
  });

  it("enriches merged views with focus tier and reason by entry_key", () => {
    const views = overlayAtlas([fasciola, toxocara], []);
    const focus = new Map([
      [
        "fasciola-hepatica",
        {
          tier: "key" as const,
          reason: 'Named in tutorial "Week2.pdf"',
          override: null,
          materialIds: ["mat-week2"],
        },
      ],
    ]);
    const enriched = enrichEntriesWithFocus(views, focus, true);
    expect(enriched.find((e) => e.id === "fasciola-hepatica")).toMatchObject({
      tier: "key",
      reason: 'Named in tutorial "Week2.pdf"',
      override: null,
      focusMaterialIds: ["mat-week2"],
    });
    expect(enriched.find((e) => e.id === "toxocara-canis")).toMatchObject({
      tier: null,
      reason: null,
      override: null,
      focusMaterialIds: [],
    });
  });

  it("applies stored override over cached scan tier on read", () => {
    const views = overlayAtlas([fasciola], []);
    const focus = new Map([
      [
        "fasciola-hepatica",
        {
          tier: "key" as const,
          reason: 'Named in tutorial "Week2.pdf"',
          override: "standard" as const,
          materialIds: ["mat-week2"],
        },
      ],
    ]);
    const enriched = enrichEntriesWithFocus(views, focus, true);
    expect(enriched[0]).toMatchObject({
      tier: "standard",
      reason: "Manual demote",
      override: "standard",
      focusMaterialIds: [],
    });
  });

  it("unions dataset and learner aliases, deduped by searchable form", () => {
    const demodex = datasetEntry({
      key: "demodex-canis",
      canonicalName: "Demodex canis",
      commonName: "Canine demodex mite",
      aliases: ["follicle mite"],
      misspellings: ["Demodex cannis"],
    });
    const views = overlayAtlas(
      [demodex],
      [
        overlayRow({
          id: "row-alias",
          origin_key: "demodex-canis",
          canonical_name: "Demodex canis",
          aliases_json: JSON.stringify(["Follicle Mite", "follicular mite"]),
        }),
      ],
    );
    expect(views[0].aliases).toEqual([
      "follicle mite",
      "Demodex cannis",
      "follicular mite",
    ]);
    expect(views[0].learnerAliases).toEqual(["Follicle Mite", "follicular mite"]);
  });

  it("dedupes learner aliases by separator-collapsed form and drops short ones", () => {
    const demodex = datasetEntry({
      key: "demodex-canis",
      canonicalName: "Demodex canis",
      commonName: "Canine demodex mite",
      aliases: ["follicle mite"],
      misspellings: [],
    });
    const views = overlayAtlas(
      [demodex],
      [
        overlayRow({
          id: "row-alias",
          origin_key: "demodex-canis",
          canonical_name: "Demodex canis",
          aliases_json: JSON.stringify(["follicle_mite", "- _", "dc"]),
        }),
      ],
    );
    expect(views[0].aliases).toEqual(["follicle mite"]);
  });

  it("treats null or malformed aliases_json as no learner aliases", () => {
    const views = overlayAtlas(
      [fasciola],
      [
        overlayRow({
          id: "row-bad",
          origin_key: "fasciola-hepatica",
          canonical_name: "Fasciola hepatica",
          aliases_json: "{not json",
        }),
      ],
    );
    expect(views[0].aliases).toEqual(toEntryView(fasciola).aliases);
    expect(views[0].learnerAliases).toEqual([]);
    expect(toEntryView(fasciola).learnerAliases).toEqual([]);
  });
});
