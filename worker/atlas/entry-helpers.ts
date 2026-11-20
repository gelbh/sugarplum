import { HTTPException } from "hono/http-exception";
import { viewFromOverlay, type OverlayRow } from "./merge";
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
  parasiteFieldsPatchSchema,
  parasiteFieldsSchema,
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
              created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
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
              created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
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

export async function insertOverlayFromDataset(
  db: D1Database,
  atlasId: string,
  entry: DatasetEntry,
  patch: {
    commonName?: string | null;
    fields?: ParasiteFields;
    deletedAt?: string | null;
    editedAt?: string | null;
  },
): Promise<EntryRow> {
  const id = newId();
  const ts = nowIso();
  const fields = patch.fields ?? entry.fields;
  const commonName =
    patch.commonName !== undefined ? patch.commonName : entry.commonName;
  const editedAt = patch.editedAt ?? null;
  const deletedAt = patch.deletedAt ?? null;
  await db
    .prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      atlasId,
      entry.canonicalName,
      commonName,
      JSON.stringify(fields),
      ts,
      ts,
      entry.key,
      PARASITE_DATASET_VERSION,
      editedAt,
      deletedAt,
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
