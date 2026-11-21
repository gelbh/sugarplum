import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { planEntryWrite } from "../../../worker/atlas/entry-helpers";
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
    expect(plan.commonName).toBeNull();
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
