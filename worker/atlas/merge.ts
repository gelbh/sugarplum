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
import { searchable } from "../../src/atlas/hub/nameMatch";

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
  field_overrides_json: string | null;
  /** JSON string array of learner aliases; NULL means none. */
  aliases_json: string | null;
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

/** NULL when the learner's name equals the dataset name (the read path falls back to it). */
export function storedCommonName(
  submitted: string,
  datasetCommonName: string | null,
): string | null {
  return submitted === datasetCommonName ? null : submitted;
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

/**
 * A stored JSON object column, or null when it is malformed (bad JSON or not
 * a plain object). Empty or missing means no keys, not malformed.
 */
export function tryParseObject(
  json: string | null | undefined,
): Record<string, unknown> | null {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

function parseObject(
  json: string | null | undefined,
  context: { rowId?: string; column: string },
): Record<string, unknown> {
  const parsed = tryParseObject(json);
  if (parsed) return parsed;
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

/**
 * Learner values are `ParasiteFields`, which is wider than the dataset's
 * `DatasetFields`; the view type is the dataset one. The single cast lives here.
 */
function viewFields(...parts: Record<string, unknown>[]): DatasetFields {
  return Object.assign({}, emptyParasiteFields(), ...parts) as DatasetFields;
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
  // Loose check on purpose: a SELECT that omits the column must read as a legacy copy, never as {}.
  const legacy = row.field_overrides_json == null;
  const stored = legacy
    ? parseObject(row.fields_json, { rowId: row.id, column: "fields_json" })
    : parseObject(row.field_overrides_json, {
        rowId: row.id,
        column: "field_overrides_json",
      });
  const out: Record<string, unknown> = {};
  for (const key of PARASITE_FIELD_KEYS) {
    if (!(key in stored)) continue;
    const value = legacy ? withSchemaDefaults(key, stored[key]) : stored[key];
    if (sameFieldValue(value, datasetFields[key])) continue;
    out[key] = value;
  }
  return out as Partial<ParasiteFields>;
}

export type MergedOverlayFields = {
  fields: DatasetFields;
  /**
   * Override keys whose final (diagnostic-synced) value differs from the
   * dataset. Empty for learner-added rows, and for origin rows whose dataset
   * entry is gone: there is no dataset value to reset to.
   */
  editedFields: FieldKey[];
};

/**
 * The one place merged overlay fields are built (views, Focus, PATCH base).
 * Overrides are computed once per row.
 */
export function mergeOverlayFields(
  datasetFields: DatasetFields | null,
  row: OverlayFieldsRow,
): MergedOverlayFields {
  const parse = (column: "fields_json" | "field_overrides_json") =>
    parseObject(row[column], { rowId: row.id, column });
  if (row.origin_key === null) {
    return { fields: syncFields(viewFields(parse("fields_json"))), editedFields: [] };
  }
  if (datasetFields === null) {
    return {
      fields: syncFields(
        viewFields(parse("fields_json"), parse("field_overrides_json")),
      ),
      editedFields: [],
    };
  }
  const overrides = overlayOverrides(datasetFields, row);
  const fields = syncFields(viewFields(datasetFields, overrides));
  const editedFields = (Object.keys(overrides) as FieldKey[]).filter(
    (key) => !sameFieldValue(fields[key], datasetFields[key]),
  );
  return { fields, editedFields };
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

export function parseLearnerAliases(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((a): a is string => typeof a === "string")
      : [];
  } catch {
    return [];
  }
}

/** Dataset aliases first, then learner aliases; duplicates by searchable form dropped. */
function unionAliases(dataset: string[], learner: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const alias of [...dataset, ...learner]) {
    const key = searchable(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

export function viewFromOverlay(
  row: OverlayRow,
  base: DatasetEntry | null,
): AtlasEntryView {
  const learnerAliases = parseLearnerAliases(row.aliases_json);
  const fromDataset = base ? toEntryView(base) : null;
  const media = concatOverlayMedia(base, row);
  const merged = mergeOverlayFields(base?.fields ?? null, row);
  return {
    id: row.id,
    originKey: row.origin_key,
    canonicalName: base?.canonicalName ?? row.canonical_name,
    // NULL means "use the dataset name", so dataset fixes to the name show through.
    commonName: row.common_name ?? base?.commonName ?? null,
    aliases: unionAliases(fromDataset?.aliases ?? [], learnerAliases),
    learnerAliases,
    fields: merged.fields,
    refs: media.refs,
    images: media.images,
    editedAt: row.edited_at,
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    inPack: null,
    editedFields: merged.editedFields,
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
