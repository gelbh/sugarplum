import type { DatasetEntry } from "../../../worker/atlas/datasets/schema";
import type { OverlayRow } from "../../../worker/atlas/merge";
import { emptyParasiteFields } from "../../../worker/atlas/templates/parasite";

export function datasetEntry(
  overrides: Partial<DatasetEntry> &
    Pick<DatasetEntry, "key" | "canonicalName">,
): DatasetEntry {
  return {
    commonName: null,
    aliases: [],
    misspellings: [],
    fields: {
      ...emptyParasiteFields(),
      group: "nematode",
    },
    refs: [
      {
        field: null,
        citation: "Taylor 2016",
        url: "https://example.com/ref",
        note: null,
      },
    ],
    images: [],
    ...overrides,
  } as DatasetEntry;
}

export function overlayRow(
  overrides: Partial<OverlayRow> & Pick<OverlayRow, "id" | "canonical_name">,
): OverlayRow {
  return {
    origin_key: null,
    origin_version: null,
    common_name: null,
    fields_json: JSON.stringify({
      ...emptyParasiteFields(),
      group: "nematode",
      family: "Editedidae",
    }),
    edited_at: "2026-11-09T12:00:00.000Z",
    deleted_at: null,
    field_overrides_json: null,
    aliases_json: null,
    ...overrides,
  };
}
