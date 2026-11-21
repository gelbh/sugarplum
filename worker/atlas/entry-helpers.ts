import { HTTPException } from "hono/http-exception";
import {
  mergeOverlayFields,
  overlayOverrides,
  sameFieldValue,
  storedCommonName,
  tryParseObject,
  viewFromOverlay,
  type OverlayRow,
} from "./merge";
import { type EntryRow } from "./entryOverlays";
import { convertLegacyOverlay } from "./heal-fields";
import {
  loadParasiteDataset,
  PARASITE_DATASET_VERSION,
} from "./datasets/parasites/index";
import type { DatasetEntry } from "./datasets/schema";
import {
  diagnosticOwnershipIssue,
  diagnosticStageFromStages,
  syncDiagnosticOwnership,
} from "./lifecycleDiagnostic";
import {
  PARASITE_FIELD_KEYS,
  parasiteFieldsPatchSchema,
  parasiteFieldsSchema,
  type ParasiteFieldKey,
  type ParasiteFields,
} from "./templates/parasite";
import type { AtlasEntryView, AtlasTier } from "../../src/atlas/types";
import { newId, nowIso } from "./ownership";

export function datasetByKey(): Map<string, DatasetEntry> {
  return new Map(loadParasiteDataset().entries.map((e) => [e.key, e]));
}

export function datasetByCanonical(): Map<string, DatasetEntry> {
  return new Map(
    loadParasiteDataset().entries.map((e) => [e.canonicalName, e]),
  );
}

export function deletedEntryViews(
  entries: EntryRow[],
  overlays: OverlayRow[],
  dataset: Map<string, DatasetEntry>,
): AtlasEntryView[] {
  const byId = new Map(overlays.map((o) => [o.id, o]));
  const out: AtlasEntryView[] = [];
  for (const e of entries) {
    if (!e.deleted_at) continue;
    const overlay = byId.get(e.id);
    if (!overlay) continue;
    const base = e.origin_key ? (dataset.get(e.origin_key) ?? null) : null;
    out.push(viewFromOverlay(overlay, base));
  }
  return out;
}

export async function findEntryById(
  db: D1Database,
  atlasId: string,
  entryId: string,
): Promise<EntryRow | null> {
  return db
    .prepare(
      `SELECT id, atlas_id, canonical_name, common_name, fields_json, status,
              created_at, updated_at, origin_key, origin_version, edited_at, deleted_at,
              field_overrides_json, aliases_json
       FROM atlas_entries WHERE atlas_id = ? AND id = ?`,
    )
    .bind(atlasId, entryId)
    .first<EntryRow>();
}

export async function findEntryByOrigin(
  db: D1Database,
  atlasId: string,
  originKey: string,
): Promise<EntryRow | null> {
  return db
    .prepare(
      `SELECT id, atlas_id, canonical_name, common_name, fields_json, status,
              created_at, updated_at, origin_key, origin_version, edited_at, deleted_at,
              field_overrides_json, aliases_json
       FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?`,
    )
    .bind(atlasId, originKey)
    .first<EntryRow>();
}

/** Resolve a route entryId as a D1 row id or a dataset/origin key. */
export async function resolveEntry(
  db: D1Database,
  atlasId: string,
  entryId: string,
): Promise<
  | { kind: "row"; row: EntryRow }
  | { kind: "dataset"; entry: DatasetEntry }
  | null
> {
  const byId = await findEntryById(db, atlasId, entryId);
  if (byId) return { kind: "row", row: byId };
  const byOrigin = await findEntryByOrigin(db, atlasId, entryId);
  if (byOrigin) return { kind: "row", row: byOrigin };
  const entry = datasetByKey().get(entryId);
  if (entry) return { kind: "dataset", entry };
  return null;
}

export type EntryWritePlan = {
  fieldsJson: string;
  overridesJson: string | null;
  commonName: string | null;
};

export type EntryWriteInput = {
  fieldsPatch?: Partial<ParasiteFields>;
  resetFields?: ParasiteFieldKey[];
  commonName?: string;
};

/** Refuse to rebuild a row from a column we cannot read; saving would erase the learner's edits. */
function requireReadable(
  json: string | null | undefined,
  column: string,
  rowId: string,
): void {
  if (tryParseObject(json) !== null) return;
  console.error("atlas PATCH: stored entry JSON is unreadable", { rowId, column });
  throw new HTTPException(500, {
    message: "Stored entry data is unreadable; edit not saved",
  });
}

/**
 * The columns one entry write stores. `row` is null for the first write to a
 * dataset entry (an overlay insert). Pure: no I/O.
 *
 * Every dataset-origin write keeps the full merged snapshot in `fields_json`,
 * so a parasite later removed from the bundle still shows the learner's last
 * view. Reads ignore that snapshot while the dataset entry exists.
 */
export function planEntryWrite(
  row: EntryRow | null,
  dataset: DatasetEntry | null,
  input: EntryWriteInput,
): EntryWritePlan {
  const { fieldsPatch, resetFields, commonName } = input;
  if (row === null) {
    if (!dataset) throw new Error("planEntryWrite: no row and no dataset entry");
    const next = nextFieldOverrides(dataset.fields, {}, fieldsPatch, resetFields);
    return {
      fieldsJson: JSON.stringify(next.fields),
      overridesJson: JSON.stringify(next.overrides),
      // NULL inherits the dataset name, so later dataset fixes still show.
      commonName:
        commonName === undefined
          ? null
          : storedCommonName(commonName, dataset.commonName),
    };
  }

  if (resetFields !== undefined && !dataset) {
    throw new HTTPException(400, {
      message: "Only built-in parasites have dataset fields to reset",
    });
  }
  requireReadable(row.field_overrides_json, "field_overrides_json", row.id);
  if (row.field_overrides_json === null || !dataset) {
    requireReadable(row.fields_json, "fields_json", row.id);
  }

  // On a dataset-origin row a name equal to the dataset name is stored as
  // NULL, including a legacy copy this write converts (same rule as the backfill).
  const submittedCommon = commonName ?? row.common_name;
  const nextCommon =
    dataset && submittedCommon !== null
      ? storedCommonName(submittedCommon, dataset.commonName)
      : submittedCommon;

  if (dataset) {
    // A legacy full copy is healed and converted by this write, as the backfill does.
    const current =
      row.field_overrides_json === null
        ? (convertLegacyOverlay(row, dataset)?.overrides ?? {})
        : overlayOverrides(dataset.fields, row);
    const next = nextFieldOverrides(dataset.fields, current, fieldsPatch, resetFields);
    return {
      fieldsJson: JSON.stringify(next.fields),
      overridesJson: JSON.stringify(next.overrides),
      commonName: nextCommon,
    };
  }

  const fields = mergeFields(mergeOverlayFields(null, row).fields, fieldsPatch);
  if (row.origin_key === null || row.field_overrides_json === null) {
    // Learner-added rows keep full fields. A legacy origin row whose dataset
    // entry is gone stays a legacy full copy, so its edits survive if the
    // entry returns to the bundle.
    return {
      fieldsJson: JSON.stringify(fields),
      overridesJson: null,
      commonName: nextCommon,
    };
  }
  // Origin row whose dataset entry is gone: still an override row. Nothing to
  // diff against, so the patched keys join the stored overrides.
  const overrides: Record<string, unknown> = {
    ...tryParseObject(row.field_overrides_json),
  };
  for (const key of Object.keys(fieldsPatch ?? {}) as ParasiteFieldKey[]) {
    overrides[key] = fields[key];
  }
  return {
    fieldsJson: JSON.stringify(fields),
    overridesJson: JSON.stringify(overrides),
    commonName: nextCommon,
  };
}

/** Dataset-origin overlay row, written from `plan` (default: no edits). */
export async function insertOverlayFromDataset(
  db: D1Database,
  atlasId: string,
  entry: DatasetEntry,
  patch: {
    plan?: EntryWritePlan;
    deletedAt?: string | null;
    editedAt?: string | null;
    aliasesJson?: string | null;
  },
): Promise<EntryRow> {
  const id = newId();
  const ts = nowIso();
  const plan = patch.plan ?? planEntryWrite(null, entry, {});
  await db
    .prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at,
         field_overrides_json, aliases_json
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      atlasId,
      entry.canonicalName,
      plan.commonName,
      plan.fieldsJson,
      ts,
      ts,
      entry.key,
      PARASITE_DATASET_VERSION,
      patch.editedAt ?? null,
      patch.deletedAt ?? null,
      plan.overridesJson,
      patch.aliasesJson ?? null,
    )
    .run();
  const row = await findEntryById(db, atlasId, id);
  if (!row) throw new HTTPException(500, { message: "Failed to create entry" });
  return row;
}

export function parseFieldsPatch(
  raw: unknown,
): Partial<ParasiteFields> | undefined {
  if (raw === undefined) return undefined;
  const parsed = parasiteFieldsPatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid fields" });
  }
  return parsed.data;
}

export function parseResetFields(raw: unknown): ParasiteFieldKey[] | undefined {
  if (raw === undefined) return undefined;
  const known = PARASITE_FIELD_KEYS as readonly string[];
  if (
    !Array.isArray(raw) ||
    raw.some((k) => typeof k !== "string" || !known.includes(k))
  ) {
    throw new HTTPException(400, {
      message: "resetFields must list known field keys",
    });
  }
  return [...new Set(raw as ParasiteFieldKey[])];
}

/**
 * A stored `diagnosticStage` override that names a different stage than the
 * flagged one (dataset or overridden stages) is stale: the stage flag wins,
 * as on read. Dropping it keeps unrelated PATCHes from failing validation.
 */
function dropConflictingDiagnosticStage(
  pending: Partial<ParasiteFields>,
  dataset: ParasiteFields,
): void {
  const mirror = pending.diagnosticStage;
  if (!mirror) return;
  const flagged = diagnosticStageFromStages(
    pending.lifecycleStages ?? dataset.lifecycleStages,
  );
  if (flagged && flagged.toLowerCase() !== mirror.toLowerCase()) {
    delete pending.diagnosticStage;
  }
}

/**
 * Overrides after a write: the merged result diffed against today's dataset,
 * so a value equal to the dataset clears its override. Reset wins over patch.
 * `fields` is the merged snapshot.
 */
function nextFieldOverrides(
  dataset: ParasiteFields,
  current: Partial<ParasiteFields>,
  patch: Partial<ParasiteFields> | undefined,
  resetFields: ParasiteFieldKey[] | undefined,
): { overrides: Partial<ParasiteFields>; fields: ParasiteFields } {
  const pending: Partial<ParasiteFields> = { ...current, ...patch };
  for (const key of resetFields ?? []) delete pending[key];
  if (!(patch && "diagnosticStage" in patch)) {
    dropConflictingDiagnosticStage(pending, dataset);
  }
  const fields = mergeFields(dataset, pending);
  const overrides: Record<string, unknown> = {};
  for (const key of PARASITE_FIELD_KEYS) {
    if (!sameFieldValue(fields[key], dataset[key])) overrides[key] = fields[key];
  }
  return { overrides: overrides as Partial<ParasiteFields>, fields };
}

export function parseFocusOverride(raw: unknown): AtlasTier | null {
  if (raw === null) return null;
  if (raw === "key" || raw === "frequent" || raw === "standard") return raw;
  throw new HTTPException(400, {
    message: "override must be key, frequent, standard, or null",
  });
}

export function mergeFields(
  base: ParasiteFields,
  patch: Partial<ParasiteFields> | undefined,
): ParasiteFields {
  if (!patch) return base;
  const merged = parasiteFieldsSchema.parse({ ...base, ...patch });
  const ownershipError = diagnosticOwnershipIssue(
    merged.lifecycleStages,
    merged.diagnosticStage,
  );
  if (ownershipError) {
    throw new HTTPException(400, { message: ownershipError });
  }
  const synced = syncDiagnosticOwnership(
    merged.lifecycleStages,
    merged.diagnosticStage,
  );
  return {
    ...merged,
    lifecycleStages: synced.stages,
    diagnosticStage: synced.diagnosticStage,
  };
}
