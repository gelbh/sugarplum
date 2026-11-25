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

describe("overlayAtlas editedFields", () => {
  const fasciola = datasetEntry({
    key: "fasciola-hepatica",
    canonicalName: "Fasciola hepatica",
    fields: {
      ...emptyParasiteFields(),
      group: "trematode",
      family: "Fasciolidae",
      significance: "Dataset text",
    },
  });

  it("lists override keys and ignores overrides equal to the dataset", () => {
    const [view] = overlayAtlas(
      [fasciola],
      [
        overlayRow({
          id: "row-1",
          origin_key: "fasciola-hepatica",
          canonical_name: "Fasciola hepatica",
          fields_json: "{}",
          field_overrides_json: JSON.stringify({
            significance: "Mine",
            family: "Fasciolidae",
          }),
        }),
      ],
    );
    expect(view.editedFields).toEqual(["significance"]);
    expect(view.fields.significance).toBe("Mine");
  });

  it("is empty for unedited dataset and learner-added entries", () => {
    const views = overlayAtlas(
      [fasciola],
      [overlayRow({ id: "row-l", canonical_name: "Madeupius fictus" })],
    );
    expect(views.map((v) => v.editedFields)).toEqual([[], []]);
    expect(views.map((v) => v.commonNameEdited)).toEqual([false, false]);
  });

  it("flags the common name as edited only when non-null and different", () => {
    const row = (common_name: string | null) =>
      overlayRow({
        id: "row-c",
        origin_key: "fasciola-hepatica",
        canonical_name: "Fasciola hepatica",
        common_name,
        fields_json: "{}",
        field_overrides_json: "{}",
      });
    const fasciolaNamed = { ...fasciola, commonName: "Liver fluke" };
    const [nullName] = overlayAtlas([fasciolaNamed], [row(null)]);
    expect(nullName.commonName).toBe("Liver fluke");
    expect(nullName.commonNameEdited).toBe(false);
    const [legacyCopy] = overlayAtlas([fasciolaNamed], [row("Liver fluke")]);
    expect(legacyCopy.commonNameEdited).toBe(false);
    const [renamed] = overlayAtlas([fasciolaNamed], [row("Sheep fluke")]);
    expect(renamed.commonName).toBe("Sheep fluke");
    expect(renamed.commonNameEdited).toBe(true);
  });
});
