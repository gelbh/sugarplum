import { HTTPException } from "hono/http-exception";
import { sameFieldValue, viewFromOverlay, type OverlayRow } from "./merge";
import { type EntryRow } from "./entryOverlays";
import {
  loadParasiteDataset,
  PARASITE_DATASET_VERSION,
} from "./datasets/parasites/index";
import type { DatasetEntry } from "./datasets/schema";
import {
  diagnosticOwnershipIssue,
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

/** NULL when the learner's name equals the dataset name (the read path falls back to it). */
export function storedCommonName(
  submitted: string,
  datasetCommonName: string | null,
): string | null {
  return submitted === datasetCommonName ? null : submitted;
}

/** Dataset-origin overlay row; stores overrides only (fields_json is '{}'). */
export async function insertOverlayFromDataset(
  db: D1Database,
  atlasId: string,
  entry: DatasetEntry,
  patch: {
    commonName?: string | null;
    overrides?: Partial<ParasiteFields>;
    deletedAt?: string | null;
    editedAt?: string | null;
    aliasesJson?: string | null;
  },
): Promise<EntryRow> {
  const id = newId();
  const ts = nowIso();
  // NULL inherits the dataset name, so later dataset fixes still show.
  const commonName =
    typeof patch.commonName === "string"
      ? storedCommonName(patch.commonName, entry.commonName)
      : null;
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
      commonName,
      "{}",
      ts,
      ts,
      entry.key,
      PARASITE_DATASET_VERSION,
      patch.editedAt ?? null,
      patch.deletedAt ?? null,
      JSON.stringify(patch.overrides ?? {}),
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
 * Overrides after a write: the merged result diffed against today's dataset,
 * so a value equal to the dataset clears its override. Reset wins over patch.
 */
export function nextFieldOverrides(
  dataset: ParasiteFields,
  current: Partial<ParasiteFields>,
  patch: Partial<ParasiteFields> | undefined,
  resetFields: ParasiteFieldKey[] | undefined,
): Partial<ParasiteFields> {
  const pending: Partial<ParasiteFields> = { ...current, ...patch };
  for (const key of resetFields ?? []) delete pending[key];
  const merged = mergeFields(dataset, pending);
  const out: Partial<ParasiteFields> = {};
  for (const key of PARASITE_FIELD_KEYS) {
    if (!sameFieldValue(merged[key], dataset[key])) {
      Object.assign(out, { [key]: merged[key] });
    }
  }
  return out;
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
