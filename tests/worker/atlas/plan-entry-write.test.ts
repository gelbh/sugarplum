import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
  aliasesJson,
  parseAliasesPatch,
  planEntryWrite,
} from "../../../worker/atlas/entry-helpers";
import type { EntryRow } from "../../../worker/atlas/entryOverlays";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import { emptyParasiteFields } from "../../../worker/atlas/templates/parasite";

const TS = "2026-02-01T00:00:00.000Z";
const dataset = loadParasiteDataset().entries.find(
  (e) => e.key === "fasciola-hepatica",
)!;

function row(overrides: Partial<EntryRow>): EntryRow {
  return {
    id: "row-1",
    atlas_id: "atlas-1",
    canonical_name: dataset.canonicalName,
    common_name: null,
    fields_json: "{}",
    status: "accepted",
    created_at: TS,
    updated_at: TS,
    origin_key: dataset.key,
    origin_version: 1,
    edited_at: TS,
    deleted_at: null,
    field_overrides_json: "{}",
    aliases_json: null,
    ...overrides,
  };
}

describe("planEntryWrite", () => {
  it("plans only the changed key for the first edit of a dataset entry", () => {
    const plan = planEntryWrite(null, dataset, {
      fieldsPatch: { significance: "Mine" },
    });
    expect(JSON.parse(plan.overridesJson!)).toEqual({ significance: "Mine" });
    expect(JSON.parse(plan.fieldsJson)).toEqual({
      ...dataset.fields,
      significance: "Mine",
    });
    expect(plan.commonName).toBeNull();
  });

  it("plans the plain dataset snapshot for an insert with no edits", () => {
    const plan = planEntryWrite(null, dataset, {});
    expect(plan.overridesJson).toBe("{}");
    expect(JSON.parse(plan.fieldsJson)).toEqual(dataset.fields);
  });

  it("keeps a retired origin override row an override row", () => {
    const snapshot = { ...dataset.fields, significance: "Old" };
    const plan = planEntryWrite(
      row({
        origin_key: "no-such-parasite",
        fields_json: JSON.stringify(snapshot),
        field_overrides_json: JSON.stringify({ significance: "Old" }),
      }),
      null,
      { fieldsPatch: { family: "Editedidae" } },
    );
    expect(JSON.parse(plan.overridesJson!)).toEqual({
      significance: "Old",
      family: "Editedidae",
    });
    expect(JSON.parse(plan.fieldsJson)).toEqual({ ...snapshot, family: "Editedidae" });
  });

  it("keeps a retired legacy row a legacy full copy", () => {
    const plan = planEntryWrite(
      row({
        origin_key: "no-such-parasite",
        fields_json: JSON.stringify({ ...dataset.fields, significance: "Old" }),
        field_overrides_json: null,
      }),
      null,
      { fieldsPatch: { family: "Editedidae" } },
    );
    expect(plan.overridesJson).toBeNull();
    expect(JSON.parse(plan.fieldsJson)).toMatchObject({
      significance: "Old",
      family: "Editedidae",
    });
  });

  it("merges a patch into stored overrides and drops values equal to the dataset", () => {
    const plan = planEntryWrite(
      row({ field_overrides_json: JSON.stringify({ family: "Editedidae" }) }),
      dataset,
      {
        fieldsPatch: {
          significance: "Mine",
          distribution: dataset.fields.distribution,
        },
      },
    );
    expect(JSON.parse(plan.overridesJson!)).toEqual({
      family: "Editedidae",
      significance: "Mine",
    });
  });

  it("resetFields removes a stored override", () => {
    const plan = planEntryWrite(
      row({
        field_overrides_json: JSON.stringify({ family: "Editedidae", significance: "Mine" }),
      }),
      dataset,
      { resetFields: ["family"] },
    );
    expect(JSON.parse(plan.overridesJson!)).toEqual({ significance: "Mine" });
  });

  it("converts a legacy full copy into overrides", () => {
    const plan = planEntryWrite(
      row({
        field_overrides_json: null,
        fields_json: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
      }),
      dataset,
      { fieldsPatch: { family: "Editedidae" } },
    );
    expect(JSON.parse(plan.overridesJson!)).toEqual({
      significance: "Old copy",
      family: "Editedidae",
    });
  });

  it("keeps full fields and NULL overrides for a learner-added row", () => {
    const learner = { ...emptyParasiteFields(), group: "nematode", family: "Mine" };
    const plan = planEntryWrite(
      row({
        origin_key: null,
        canonical_name: "Madeupius fictus",
        fields_json: JSON.stringify(learner),
        field_overrides_json: null,
      }),
      null,
      { fieldsPatch: { significance: "Learner text" }, commonName: "Imaginary" },
    );
    expect(plan.overridesJson).toBeNull();
    expect(JSON.parse(plan.fieldsJson)).toMatchObject({
      family: "Mine",
      significance: "Learner text",
    });
    expect(plan.commonName).toBe("Imaginary");
  });

  it("stores NULL when the common name equals the dataset name", () => {
    const plan = planEntryWrite(row({ common_name: "Custom" }), dataset, {
      commonName: dataset.commonName!,
    });
    expect(plan.commonName).toBeNull();
  });

  it("nulls a copied dataset name when converting a legacy row without a name", () => {
    const plan = planEntryWrite(
      row({
        common_name: dataset.commonName,
        field_overrides_json: null,
        fields_json: JSON.stringify(dataset.fields),
      }),
      dataset,
      { fieldsPatch: { family: "Editedidae" } },
    );
    expect(plan.commonName).toBeNull();
  });

  it("keeps a learner's own common name on a fields-only write", () => {
    const plan = planEntryWrite(row({ common_name: "Sheep fluke" }), dataset, {
      fieldsPatch: { family: "Editedidae" },
    });
    expect(plan.commonName).toBe("Sheep fluke");
  });

  it("drops a stale diagnosticStage override when a stage is flagged", () => {
    const giardia = loadParasiteDataset().entries.find(
      (e) => e.key === "giardia-duodenalis",
    )!;
    const plan = planEntryWrite(
      row({
        origin_key: giardia.key,
        field_overrides_json: JSON.stringify({
          diagnosticStage: "trophozoite",
          significance: "Mine",
        }),
      }),
      giardia,
      { commonName: "Beaver fever" },
    );
    expect(JSON.parse(plan.overridesJson!)).toEqual({ significance: "Mine" });
  });

  it("refuses to plan from an unreadable overrides column", () => {
    expect(() =>
      planEntryWrite(row({ field_overrides_json: "{not json" }), dataset, {
        fieldsPatch: { family: "Editedidae" },
      }),
    ).toThrow(HTTPException);
  });

  it("rejects resetFields when there is no dataset entry", () => {
    expect(() =>
      planEntryWrite(row({ origin_key: null, field_overrides_json: null }), null, {
        resetFields: ["family"],
      }),
    ).toThrow(/Only built-in parasites/);
  });
});

describe("planEntryWrite aliases", () => {
  it("leaves aliases unwritten when the patch omits them", () => {
    expect(planEntryWrite(null, dataset, {}).aliasesJson).toBeUndefined();
    expect(
      planEntryWrite(row({ aliases_json: '["kept"]' }), dataset, {
        commonName: "Mine",
      }).aliasesJson,
    ).toBeUndefined();
  });

  it("stores a JSON list, or null for an empty list", () => {
    expect(
      planEntryWrite(null, dataset, { aliases: ["big liver fluke"] }).aliasesJson,
    ).toBe('["big liver fluke"]');
    expect(
      planEntryWrite(row({ aliases_json: '["old"]' }), dataset, { aliases: [] })
        .aliasesJson,
    ).toBeNull();
  });
});

describe("parseAliasesPatch", () => {
  it("returns undefined when absent and a cleaned list otherwise", () => {
    expect(parseAliasesPatch(undefined)).toBeUndefined();
    expect(parseAliasesPatch([" fluke ", "", "FLUKE", "worm"])).toEqual([
      "fluke",
      "worm",
    ]);
  });

  it("drops separator-only and too-short aliases", () => {
    expect(parseAliasesPatch(["-", "_", "- _", "ab", "F_hepatica", "F hepatica"])).toEqual([
      "F_hepatica",
    ]);
  });

  it("rejects a raw list over 200 items before cleaning", () => {
    expect(() => parseAliasesPatch(Array.from({ length: 201 }, () => ""))).toThrow(
      /At most 200 raw aliases/,
    );
    expect(parseAliasesPatch(Array.from({ length: 200 }, () => "fluke"))).toEqual([
      "fluke",
    ]);
  });

  it("checks limits after cleaning", () => {
    const padded = [
      ...Array.from({ length: 20 }, (_, i) => `alias ${i}`),
      " ",
      "ALIAS 0",
    ];
    expect(parseAliasesPatch(padded)).toHaveLength(20);
    expect(() => parseAliasesPatch(["a".repeat(81)])).toThrow(/80 characters/);
    expect(() =>
      parseAliasesPatch(Array.from({ length: 21 }, (_, i) => `alias ${i}`)),
    ).toThrow(/At most 20 aliases/);
    expect(() => parseAliasesPatch([1])).toThrow(HTTPException);
    expect(() => parseAliasesPatch(null)).toThrow(/list of strings/);
  });

  it("aliasesJson stores null for an empty list", () => {
    expect(aliasesJson([])).toBeNull();
    expect(aliasesJson(["a"])).toBe('["a"]');
  });
});

describe("planEntryWrite canonicalName", () => {
  const learner = () =>
    row({
      origin_key: null,
      origin_version: null,
      canonical_name: "Madeupius fictus",
      fields_json: JSON.stringify({ ...emptyParasiteFields(), group: "nematode" }),
      field_overrides_json: null,
    });

  function status(fn: () => unknown): number | undefined {
    try {
      fn();
    } catch (e) {
      return e instanceof HTTPException ? e.status : undefined;
    }
    return undefined;
  }

  it("leaves the name unwritten when the patch omits it", () => {
    expect(planEntryWrite(learner(), null, {}).canonicalName).toBeUndefined();
  });

  it("normalizes a learner rename", () => {
    expect(
      planEntryWrite(learner(), null, { canonicalName: "  madeupius renamus " })
        .canonicalName,
    ).toBe("Madeupius renamus");
  });

  it("refuses to rename any dataset-origin entry", () => {
    expect(() =>
      planEntryWrite(null, dataset, { canonicalName: "Fasciola gigantica" }),
    ).toThrow(/built-in parasite cannot change/);
    expect(() =>
      planEntryWrite(row({}), dataset, { canonicalName: "Fasciola gigantica" }),
    ).toThrow(/built-in parasite cannot change/);
    // Origin row whose dataset entry left the bundle is still built-in.
    expect(() =>
      planEntryWrite(row({ origin_key: "gone" }), null, {
        canonicalName: "Fasciola gigantica",
      }),
    ).toThrow(/built-in parasite cannot change/);
  });

  it("returns 400 for an empty name and 409 for a dataset name", () => {
    expect(status(() => planEntryWrite(learner(), null, { canonicalName: "" }))).toBe(
      400,
    );
    expect(
      status(() =>
        planEntryWrite(learner(), null, { canonicalName: dataset.canonicalName }),
      ),
    ).toBe(409);
  });
});
