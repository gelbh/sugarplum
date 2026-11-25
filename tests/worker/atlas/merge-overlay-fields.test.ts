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

describe("mergeOverlayFields", () => {
  const datasetFields = {
    ...emptyParasiteFields(),
    group: "trematode",
    family: "Fasciolidae",
    significance: "Dataset text",
    distribution: "Worldwide",
  } as DatasetEntry["fields"];

  const originRow = (overrides: Partial<OverlayRow>) => ({
    origin_key: "fasciola-hepatica",
    fields_json: "{}",
    field_overrides_json: null as string | null,
    ...overrides,
  });

  it("lets an override win only for its own key", () => {
    const { fields } = mergeOverlayFields(
      datasetFields,
      originRow({ field_overrides_json: JSON.stringify({ significance: "Mine" }) }),
    );
    expect(fields.significance).toBe("Mine");
    expect(fields.family).toBe("Fasciolidae");
    expect(fields.distribution).toBe("Worldwide");
  });

  it("shows a dataset change to a non-overridden field", () => {
    const row = originRow({
      field_overrides_json: JSON.stringify({ significance: "Mine" }),
    });
    const { fields } = mergeOverlayFields(
      { ...datasetFields, distribution: "Temperate regions" },
      row,
    );
    expect(fields.distribution).toBe("Temperate regions");
    expect(fields.significance).toBe("Mine");
  });

  it("legacy NULL overrides with a full fields_json copy match the pre-migration view", () => {
    const legacyCopy = { ...datasetFields, family: "Editedidae" };
    const { fields } = mergeOverlayFields(
      datasetFields,
      originRow({ fields_json: JSON.stringify(legacyCopy) }),
    );
    expect(fields).toEqual(legacyCopy);
  });

  it("uses fields_json unchanged for a learner-added row", () => {
    const learner = { ...emptyParasiteFields(), group: "nematode", family: "Mine" };
    const { fields } = mergeOverlayFields(datasetFields, {
      origin_key: null,
      fields_json: JSON.stringify(learner),
      field_overrides_json: null,
    });
    expect(fields).toEqual(learner);
  });

  it("falls back to fields_json plus overrides when the dataset entry is gone", () => {
    const { fields } = mergeOverlayFields(
      null,
      originRow({ field_overrides_json: JSON.stringify({ family: "Kept" }) }),
    );
    expect(fields.family).toBe("Kept");
    expect(fields.lifecycleStages).toEqual([]);
  });

  it("compares values ignoring object key order", () => {
    expect(sameFieldValue({ min: 1, max: 2 }, { max: 2, min: 1 })).toBe(true);
    expect(sameFieldValue(["a", "b"], ["b", "a"])).toBe(false);
  });
});
