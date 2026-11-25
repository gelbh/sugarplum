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

describe("overlayAtlas legacy copies and schema defaults", () => {
  const stage = lifecycleStageSchema.parse({ name: "Egg", host: "Sheep" });
  const fasciola = datasetEntry({
    key: "fasciola-hepatica",
    canonicalName: "Fasciola hepatica",
    fields: {
      ...emptyParasiteFields(),
      group: "trematode",
      family: "Fasciolidae",
      lifecycleStages: [stage],
    },
  });
  // Written before lifecycle stages carried imageId.
  const { imageId: _dropped, ...oldStage } = stage;
  const legacyRow = (fields: Record<string, unknown>) =>
    overlayRow({
      id: "row-legacy",
      origin_key: "fasciola-hepatica",
      canonical_name: "Fasciola hepatica",
      fields_json: JSON.stringify(fields),
      field_overrides_json: null,
    });

  it("ignores a field that differs only by a missing nested default", () => {
    const [view] = overlayAtlas(
      [fasciola],
      [legacyRow({ ...fasciola.fields, lifecycleStages: [oldStage] })],
    );
    expect(view.editedFields).toEqual([]);
    expect(view.fields.lifecycleStages).toEqual([stage]);
  });

  it("still reports a real edit in a legacy copy", () => {
    const [view] = overlayAtlas(
      [fasciola],
      [
        legacyRow({
          ...fasciola.fields,
          family: "Editedidae",
          lifecycleStages: [{ ...oldStage, host: "Cattle" }],
        }),
      ],
    );
    expect(view.editedFields).toEqual(["family", "lifecycleStages"]);
    expect(view.fields.family).toBe("Editedidae");
    expect(view.fields.lifecycleStages).toEqual([{ ...stage, host: "Cattle" }]);
  });
});
