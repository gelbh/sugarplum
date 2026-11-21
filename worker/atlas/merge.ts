import type {
  AtlasEntryView,
  AtlasImageView,
  DatasetFields,
  FieldKey,
} from "../../src/atlas/types";
import type { DatasetEntry } from "./datasets/schema";
import { syncDiagnosticOwnership } from "./lifecycleDiagnostic";
import {
  emptyParasiteFields,
  PARASITE_FIELD_KEYS,
  parasiteFieldsSchema,
  type ParasiteFieldKey,
  type ParasiteFields,
} from "./templates/parasite";

/** D1 atlas_entries row shape used by overlay (refs/images optional joins). */
export type OverlayRow = {
  id: string;
  origin_key: string | null;
  origin_version: number | null;
  canonical_name: string;
  common_name: string | null;
  fields_json: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Dataset-origin rows: changed keys only. NULL on an origin row means a legacy full copy. */
  field_overrides_json?: string | null;
  /** JSON string array of learner aliases; null or absent means none. */
  aliases_json?: string | null;
  refs?: AtlasEntryView["refs"];
  images?: AtlasImageView[];
};

export function toEntryView(entry: DatasetEntry): AtlasEntryView {
  return {
    id: entry.key,
    originKey: entry.key,
    canonicalName: entry.canonicalName,
    commonName: entry.commonName,
    aliases: [...entry.aliases, ...entry.misspellings],
    fields: entry.fields,
    refs: entry.refs,
    images: entry.images.map(({ file, ...image }) => {
      const src = `/atlas/parasites/${file}`;
      return {
        ...image,
        src,
        placeholderSrc: file.endsWith(".webp")
          ? `/atlas/parasites/${file.slice(0, -5)}-blur.webp`
          : undefined,
      };
    }),
    editedAt: null,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields: [],
    commonNameEdited: false,
  };
}

export type OverlayFieldsRow = Pick<
  OverlayRow,
  "origin_key" | "fields_json" | "field_overrides_json"
> & { id?: string };

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((k) => [k, canonicalJson(record[k])]),
    );
  }
  return value;
}

/** Deep equality for field values; object key order does not matter. */
export function sameFieldValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b));
}

function parseObject(
  json: string | null | undefined,
  context: { rowId?: string; column: string },
): Record<string, unknown> {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = undefined;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  console.warn("atlas entry: ignoring malformed JSON object", {
    rowId: context.rowId ?? null,
    column: context.column,
  });
  return {};
}

/**
 * Fill schema defaults into a stored value (e.g. a stage written before
 * `imageId` existed), so a legacy copy is not mistaken for an edit.
 */
function withSchemaDefaults(key: ParasiteFieldKey, value: unknown): unknown {
  const parsed = parasiteFieldsSchema.shape[key].safeParse(value);
  return parsed.success ? parsed.data : value;
}

function syncFields(fields: DatasetFields): DatasetFields {
  const synced = syncDiagnosticOwnership(
    fields.lifecycleStages,
    fields.diagnosticStage,
  );
  return {
    ...fields,
    lifecycleStages: synced.stages,
    diagnosticStage: synced.diagnosticStage,
  };
}

/**
 * The learner's overrides on a dataset-origin row. Legacy rows (NULL
 * overrides) hold a full copy, so their overrides are whatever differs from
 * today's dataset. A stored value equal to the dataset is a no-op.
 */
export function overlayOverrides(
  datasetFields: DatasetFields,
  row: OverlayFieldsRow,
): Partial<ParasiteFields> {
  const legacy = row.field_overrides_json == null;
  const stored = legacy
    ? parseObject(row.fields_json, { rowId: row.id, column: "fields_json" })
    : parseObject(row.field_overrides_json, {
        rowId: row.id,
        column: "field_overrides_json",
      });
  const out: Partial<ParasiteFields> = {};
  for (const key of PARASITE_FIELD_KEYS) {
    if (!(key in stored)) continue;
    const value = legacy ? withSchemaDefaults(key, stored[key]) : stored[key];
    if (sameFieldValue(value, datasetFields[key])) continue;
    Object.assign(out, { [key]: value });
  }
  return out;
}

/** The one place merged overlay fields are built (views, Focus, PATCH base). */
export function mergeOverlayFields(
  datasetFields: DatasetFields | null,
  row: OverlayFieldsRow,
): DatasetFields {
  const empty = emptyParasiteFields() as DatasetFields;
  if (row.origin_key === null) {
    return syncFields({
      ...empty,
      ...parseObject(row.fields_json, { rowId: row.id, column: "fields_json" }),
    } as DatasetFields);
  }
  if (datasetFields === null) {
    return syncFields({
      ...empty,
      ...parseObject(row.fields_json, { rowId: row.id, column: "fields_json" }),
      ...parseObject(row.field_overrides_json, {
        rowId: row.id,
        column: "field_overrides_json",
      }),
    } as DatasetFields);
  }
  return syncFields({
    ...datasetFields,
    ...overlayOverrides(datasetFields, row),
  } as DatasetFields);
}

/** Dataset refs/images first, then learner overlay refs/images. */
export function concatOverlayMedia(
  base: DatasetEntry | null,
  row: Pick<OverlayRow, "refs" | "images">,
): Pick<AtlasEntryView, "refs" | "images"> {
  const fromDataset = base ? toEntryView(base) : null;
  return {
    refs: [...(fromDataset?.refs ?? []), ...(row.refs ?? [])],
    images: [...(fromDataset?.images ?? []), ...(row.images ?? [])],
  };
}

export function viewFromOverlay(
  row: OverlayRow,
  base: DatasetEntry | null,
): AtlasEntryView {
  const fromDataset = base ? toEntryView(base) : null;
  const media = concatOverlayMedia(base, row);
  const editedFields =
    base && row.origin_key !== null
      ? (Object.keys(overlayOverrides(base.fields, row)) as FieldKey[])
      : [];
  return {
    id: row.id,
    originKey: row.origin_key,
    canonicalName: base?.canonicalName ?? row.canonical_name,
    // NULL means "use the dataset name", so dataset fixes to the name show through.
    commonName: row.common_name ?? base?.commonName ?? null,
    aliases: fromDataset?.aliases ?? [],
    fields: mergeOverlayFields(base?.fields ?? null, row),
    refs: media.refs,
    images: media.images,
    editedAt: row.edited_at,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields,
    commonNameEdited:
      base !== null &&
      row.origin_key !== null &&
      row.common_name !== null &&
      row.common_name !== base.commonName,
  };
}

/**
 * Merge bundled dataset entries with D1 overlay rows (edits-over-dataset).
 * Soft-deleted origin keys are omitted (Recently deleted is a separate query).
 * Unedited entries keep dataset `key` as `id`; edited/added use the D1 row `id`.
 */
export function overlayAtlas(
  datasetEntries: DatasetEntry[],
  rows: OverlayRow[],
): AtlasEntryView[] {
  const byOrigin = new Map<string, OverlayRow>();
  const deletedOrigins = new Set<string>();
  const added: OverlayRow[] = [];

  for (const row of rows) {
    if (row.origin_key === null) {
      if (!row.deleted_at) added.push(row);
      continue;
    }
    if (row.deleted_at) {
      deletedOrigins.add(row.origin_key);
      continue;
    }
    byOrigin.set(row.origin_key, row);
  }

  const seenOrigins = new Set<string>();
  const out: AtlasEntryView[] = [];

  for (const entry of datasetEntries) {
    seenOrigins.add(entry.key);
    if (deletedOrigins.has(entry.key)) continue;
    const row = byOrigin.get(entry.key);
    if (!row) {
      out.push(toEntryView(entry));
      continue;
    }
    out.push(viewFromOverlay(row, entry));
  }

  for (const [originKey, row] of byOrigin) {
    if (seenOrigins.has(originKey)) continue;
    out.push(viewFromOverlay(row, null));
  }

  for (const row of added) {
    out.push(viewFromOverlay(row, null));
  }

  return out;
}
