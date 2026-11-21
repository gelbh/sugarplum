import type { DatasetEntry } from "./datasets/schema";
import {
  mergeOverlayFields,
  overlayOverrides,
  storedCommonName,
  tryParseObject,
  type MergedOverlayFields,
} from "./merge";
import {
  emptyParasiteFields,
  PARASITE_FIELD_KEYS,
  parasiteFieldsSchema,
  type ParasiteFieldKey,
  type ParasiteFields,
} from "./templates/parasite";

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isEmptyDefaultField(
  key: ParasiteFieldKey,
  value: ParasiteFields[ParasiteFieldKey],
): boolean {
  return deepEqual(value, emptyParasiteFields()[key]);
}

/** Restore empty-default overlay keys from dataset; null when nothing changes. */
export function healOverlayFieldsFromDataset(
  overlay: ParasiteFields,
  dataset: ParasiteFields,
): ParasiteFields | null {
  const empty = emptyParasiteFields();
  let changed = false;
  const next: ParasiteFields = { ...overlay };
  for (const key of PARASITE_FIELD_KEYS) {
    if (
      deepEqual(overlay[key], empty[key]) &&
      !deepEqual(dataset[key], empty[key])
    ) {
      (next as Record<ParasiteFieldKey, ParasiteFields[ParasiteFieldKey]>)[
        key
      ] = dataset[key];
      changed = true;
    }
  }
  return changed ? next : null;
}

export type LegacyConversion = {
  overrides: Partial<ParasiteFields>;
  /** Full merged snapshot for `fields_json`. */
  fields: MergedOverlayFields["fields"];
  commonName: string | null;
};

/**
 * Convert a legacy full-copy row (NULL overrides) into overrides. Fields
 * blanked by the earlier wipe bug are healed from the dataset first, so they
 * are not persisted as empty overrides. A name equal to the dataset name
 * becomes NULL. Null when `fields_json` is unreadable: converting would
 * erase the learner's edits. Shared by the backfill and the first PATCH.
 */
export function convertLegacyOverlay(
  row: { id?: string; fields_json: string; common_name: string | null },
  dataset: DatasetEntry,
): LegacyConversion | null {
  const stored = tryParseObject(row.fields_json);
  if (stored === null) return null;
  const parsed = parasiteFieldsSchema.safeParse(stored);
  const healed = parsed.success
    ? healOverlayFieldsFromDataset(parsed.data, dataset.fields)
    : null;
  const overrides = overlayOverrides(dataset.fields, {
    id: row.id,
    origin_key: dataset.key,
    fields_json: healed ? JSON.stringify(healed) : row.fields_json,
    field_overrides_json: null,
  });
  const { fields } = mergeOverlayFields(dataset.fields, {
    id: row.id,
    origin_key: dataset.key,
    fields_json: "{}",
    field_overrides_json: JSON.stringify(overrides),
  });
  return {
    overrides,
    fields,
    commonName:
      row.common_name === null
        ? null
        : storedCommonName(row.common_name, dataset.commonName),
  };
}
