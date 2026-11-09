import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { requireOwnedSubject } from "../subjects/routes";
import {
  overlayAtlas,
  viewFromOverlay,
  type OverlayRow,
} from "./merge";
import {
  enrichEntriesWithFocus,
  focusEntryKey,
  listEntriesWithFocus,
  loadFocusMap,
  refreshFocusBestEffort,
  setFocusOverride,
} from "./focus";
import {
  hasLearnerRefsOrImages,
  loadEntryRows,
  toOverlayRows,
  type EntryRow,
} from "./entryOverlays";
import {
  loadParasiteDataset,
  PARASITE_DATASET_VERSION,
} from "./datasets/parasites";
import type { DatasetEntry } from "./datasets/schema";
import { IMAGE_ROLES } from "./datasets/schema";
import { normalizeParasiteName } from "./names";
import {
  emptyParasiteFields,
  parasiteFieldsSchema,
  type ParasiteFields,
} from "./templates/parasite";
import { createR2PutUrl } from "../materials/r2-presign";
import type { AtlasEntryView, AtlasTier } from "../../src/atlas/types";
import type { Context } from "hono";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

const TEMPLATE_KEY = "parasite";
const DEFAULT_R2_BUCKET = "sugarplum-materials";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type AtlasRow = {
  id: string;
  subject_id: string;
  template_key: string;
  created_at: string;
};

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new HTTPException(400, { message: `${name} required` });
  return value;
}

function atlasMeta(row: AtlasRow) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    templateKey: row.template_key,
    createdAt: row.created_at,
  };
}

function datasetByKey(): Map<string, DatasetEntry> {
  return new Map(loadParasiteDataset().entries.map((e) => [e.key, e]));
}

function datasetByCanonical(): Map<string, DatasetEntry> {
  return new Map(
    loadParasiteDataset().entries.map((e) => [e.canonicalName, e]),
  );
}

async function requireAtlas(
  db: D1Database,
  subjectId: string,
): Promise<AtlasRow> {
  const atlas = await db
    .prepare(
      "SELECT id, subject_id, template_key, created_at FROM atlases WHERE subject_id = ?",
    )
    .bind(subjectId)
    .first<AtlasRow>();
  if (!atlas) throw new HTTPException(404, { message: "Atlas not found" });
  return atlas;
}

function deletedEntryViews(
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

async function findEntryById(
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

async function findEntryByOrigin(
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
async function resolveEntry(
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

async function insertOverlayFromDataset(
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

function parseFieldsPatch(
  raw: unknown,
): Partial<ParasiteFields> | undefined {
  if (raw === undefined) return undefined;
  const parsed = parasiteFieldsSchema.partial().safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid fields" });
  }
  return parsed.data;
}

function parseFocusOverride(raw: unknown): AtlasTier | null {
  if (raw === null) return null;
  if (raw === "key" || raw === "frequent" || raw === "standard") return raw;
  throw new HTTPException(400, {
    message: "override must be key, frequent, standard, or null",
  });
}

function mergeFields(
  base: ParasiteFields,
  patch: Partial<ParasiteFields> | undefined,
): ParasiteFields {
  if (!patch) return base;
  return parasiteFieldsSchema.parse({ ...base, ...patch });
}

async function requireOwnedAtlas(
  c: Parameters<typeof requireUser>[0],
  subjectId: string,
): Promise<{ userId: string; atlas: AtlasRow; db: D1Database }> {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  await requireOwnedSubject(db, subjectId, userId);
  const atlas = await requireAtlas(db, subjectId);
  return { userId, atlas, db };
}

/** Owned-subject Atlas overlay API. Guests get 401 via requireUser; SubjectPage sign-in CTA is Task 4. */
export const atlasRoutes = new Hono<AppEnv>();

atlasRoutes.post("/", async (c) => {
  const userId = await requireUser(c);
  const subjectId = requireParam(c, "subjectId");
  const db = getDb(c.env);
  await requireOwnedSubject(db, subjectId, userId);

  const existing = await db
    .prepare(
      "SELECT id, subject_id, template_key, created_at FROM atlases WHERE subject_id = ?",
    )
    .bind(subjectId)
    .first<AtlasRow>();
  if (existing) {
    throw new HTTPException(409, { message: "Atlas already exists" });
  }

  const id = newId();
  const createdAt = nowIso();
  await db
    .prepare(
      "INSERT INTO atlases (id, subject_id, template_key, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, subjectId, TEMPLATE_KEY, createdAt)
    .run();

  await refreshFocusBestEffort(db, c.env, { atlasId: id });

  return c.json(
    atlasMeta({
      id,
      subject_id: subjectId,
      template_key: TEMPLATE_KEY,
      created_at: createdAt,
    }),
    201,
  );
});

atlasRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const subjectId = requireParam(c, "subjectId");
  const db = getDb(c.env);
  await requireOwnedSubject(db, subjectId, userId);
  const atlas = await requireAtlas(db, subjectId);
  return c.json(atlasMeta(atlas));
});

atlasRoutes.get("/entries", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const merged = overlayAtlas(loadParasiteDataset().entries, overlays);
  const entries = await listEntriesWithFocus(db, c.env, {
    atlasId: atlas.id,
    subjectId: atlas.subject_id,
    entries: merged,
  });
  return c.json({ entries });
});

atlasRoutes.get("/deleted", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const entries = deletedEntryViews(rows, overlays, datasetByKey());
  return c.json({ entries });
});

atlasRoutes.post("/entries", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  let body: {
    canonicalName?: unknown;
    commonName?: unknown;
    fields?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const rawName =
    typeof body.canonicalName === "string" ? body.canonicalName.trim() : "";
  const normalized = normalizeParasiteName(rawName);
  if (!normalized) {
    throw new HTTPException(400, { message: "canonicalName required" });
  }

  if (datasetByCanonical().has(normalized.canonical)) {
    throw new HTTPException(409, {
      message: "Entry already exists in the dataset",
    });
  }

  const fields = mergeFields(
    emptyParasiteFields(),
    parseFieldsPatch(body.fields),
  );
  if (!fields.group) {
    throw new HTTPException(400, { message: "group required" });
  }
  const commonName =
    typeof body.commonName === "string"
      ? body.commonName.trim() || null
      : body.commonName === null
        ? null
        : null;

  const id = newId();
  const ts = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO atlas_entries (
           id, atlas_id, canonical_name, common_name, fields_json, status,
           created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        atlas.id,
        normalized.canonical,
        commonName,
        JSON.stringify(fields),
        ts,
        ts,
        null,
        null,
        ts,
        null,
      )
      .run();
  } catch {
    throw new HTTPException(409, { message: "Entry already exists" });
  }

  const row = await findEntryById(db, atlas.id, id);
  if (!row) throw new HTTPException(500, { message: "Failed to create entry" });
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  const overlays = await toOverlayRows(db, atlas.id, [row]);
  const focus = await loadFocusMap(db, atlas.id);
  const view = enrichEntriesWithFocus(
    overlayAtlas(loadParasiteDataset().entries, overlays),
    focus,
  ).find((e) => e.id === row.id);
  if (!view) throw new HTTPException(500, { message: "Failed to create entry" });
  return c.json(view, 201);
});

atlasRoutes.patch("/entries/:entryId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  let body: { commonName?: unknown; fields?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const fieldsPatch = parseFieldsPatch(body.fields);
  const commonNameProvided = "commonName" in body;
  const commonName = commonNameProvided
    ? typeof body.commonName === "string"
      ? body.commonName.trim() || null
      : body.commonName === null
        ? null
        : (() => {
            throw new HTTPException(400, { message: "Invalid commonName" });
          })()
    : undefined;

  if (fieldsPatch === undefined && !commonNameProvided) {
    throw new HTTPException(400, { message: "No changes" });
  }

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });

  const ts = nowIso();
  let row: EntryRow;

  if (resolved.kind === "dataset") {
    row = await insertOverlayFromDataset(db, atlas.id, resolved.entry, {
      commonName,
      fields: mergeFields(resolved.entry.fields, fieldsPatch),
      editedAt: ts,
    });
  } else {
    if (resolved.row.deleted_at) {
      throw new HTTPException(409, { message: "Entry is deleted" });
    }
    const baseFields = JSON.parse(resolved.row.fields_json) as ParasiteFields;
    const nextFields = mergeFields(baseFields, fieldsPatch);
    const nextCommon =
      commonName !== undefined ? commonName : resolved.row.common_name;
    await db
      .prepare(
        `UPDATE atlas_entries
         SET common_name = ?, fields_json = ?, edited_at = ?, updated_at = ?, status = 'accepted'
         WHERE id = ? AND atlas_id = ?`,
      )
      .bind(
        nextCommon,
        JSON.stringify(nextFields),
        ts,
        ts,
        resolved.row.id,
        atlas.id,
      )
      .run();
    const updated = await findEntryById(db, atlas.id, resolved.row.id);
    if (!updated) throw new HTTPException(404, { message: "Entry not found" });
    row = updated;
  }

  if (commonNameProvided) {
    await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  }
  const overlays = await toOverlayRows(db, atlas.id, [row]);
  const focus = await loadFocusMap(db, atlas.id);
  const views = enrichEntriesWithFocus(
    overlayAtlas(loadParasiteDataset().entries, overlays),
    focus,
  );
  const view = views.find((v) => v.id === row.id) ?? views[0];
  return c.json(view);
});

atlasRoutes.patch("/entries/:entryId/focus", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  let body: { override?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (!("override" in body)) {
    throw new HTTPException(400, { message: "override required" });
  }
  const override = parseFocusOverride(body.override);

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });
  if (resolved.kind === "row" && resolved.row.deleted_at) {
    throw new HTTPException(409, { message: "Entry is deleted" });
  }

  const entryKey =
    resolved.kind === "dataset"
      ? resolved.entry.key
      : (resolved.row.origin_key ?? resolved.row.id);
  await setFocusOverride(db, atlas.id, entryKey, override);
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });

  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const focus = await loadFocusMap(db, atlas.id);
  const entries = enrichEntriesWithFocus(
    overlayAtlas(loadParasiteDataset().entries, overlays),
    focus,
  );
  const view = entries.find((e) => focusEntryKey(e) === entryKey);
  if (!view) throw new HTTPException(404, { message: "Entry not found" });
  return c.json(view);
});

atlasRoutes.post("/entries/:entryId/soft-delete", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });

  const ts = nowIso();
  if (resolved.kind === "dataset") {
    await insertOverlayFromDataset(db, atlas.id, resolved.entry, {
      deletedAt: ts,
    });
    await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
    return c.body(null, 204);
  }
  if (resolved.row.deleted_at) {
    throw new HTTPException(409, { message: "Entry already deleted" });
  }
  await db
    .prepare(
      `UPDATE atlas_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND atlas_id = ?`,
    )
    .bind(ts, ts, resolved.row.id, atlas.id)
    .run();
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  return c.body(null, 204);
});

atlasRoutes.post("/entries/:entryId/restore", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  const row =
    (await findEntryById(db, atlas.id, entryId)) ??
    (await findEntryByOrigin(db, atlas.id, entryId));
  if (!row || !row.deleted_at) {
    throw new HTTPException(404, { message: "Deleted entry not found" });
  }

  // Soft-delete of an unedited dataset entry is only a tombstone. Drop it on
  // restore so the dataset key becomes the id again (no sticky overlay).
  const pristineOrigin =
    row.origin_key != null &&
    row.edited_at == null &&
    !(await hasLearnerRefsOrImages(db, atlas.id, row.id));
  if (pristineOrigin) {
    await db
      .prepare(`DELETE FROM atlas_entries WHERE id = ? AND atlas_id = ?`)
      .bind(row.id, atlas.id)
      .run();
    await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
    return c.body(null, 204);
  }

  const ts = nowIso();
  await db
    .prepare(
      `UPDATE atlas_entries SET deleted_at = NULL, updated_at = ? WHERE id = ? AND atlas_id = ?`,
    )
    .bind(ts, row.id, atlas.id)
    .run();
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  return c.body(null, 204);
});

atlasRoutes.post("/entries/:entryId/reset", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  const row =
    (await findEntryById(db, atlas.id, entryId)) ??
    (await findEntryByOrigin(db, atlas.id, entryId));
  if (!row) throw new HTTPException(404, { message: "Entry not found" });
  if (!row.origin_key) {
    throw new HTTPException(400, {
      message: "Learner-added entries cannot be reset",
    });
  }
  await db
    .prepare(`DELETE FROM atlas_entries WHERE id = ? AND atlas_id = ?`)
    .bind(row.id, atlas.id)
    .run();
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  return c.body(null, 204);
});

atlasRoutes.delete("/entries/:entryId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  const row =
    (await findEntryById(db, atlas.id, entryId)) ??
    (await findEntryByOrigin(db, atlas.id, entryId));
  if (!row || !row.deleted_at) {
    throw new HTTPException(404, { message: "Deleted entry not found" });
  }
  if (row.origin_key != null) {
    throw new HTTPException(400, {
      message:
        "Dataset entries cannot be permanently deleted; restore them instead",
    });
  }
  await db
    .prepare(`DELETE FROM atlas_entries WHERE id = ? AND atlas_id = ?`)
    .bind(row.id, atlas.id)
    .run();
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  return c.body(null, 204);
});

atlasRoutes.post("/entries/:entryId/refs", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  let body: {
    field?: unknown;
    citation?: unknown;
    url?: unknown;
    note?: unknown;
    materialId?: unknown;
    page?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const citation =
    typeof body.citation === "string" ? body.citation.trim() : "";
  if (!citation) {
    throw new HTTPException(400, { message: "citation required" });
  }

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });

  let row: EntryRow;
  if (resolved.kind === "dataset") {
    row = await insertOverlayFromDataset(db, atlas.id, resolved.entry, {
      editedAt: nowIso(),
    });
  } else {
    if (resolved.row.deleted_at) {
      throw new HTTPException(409, { message: "Entry is deleted" });
    }
    row = resolved.row;
  }

  const id = newId();
  const createdAt = nowIso();
  const fieldKey =
    typeof body.field === "string"
      ? body.field.trim() || null
      : body.field === null
        ? null
        : null;
  const url =
    typeof body.url === "string" ? body.url.trim() || null : null;
  const note =
    typeof body.note === "string" ? body.note.trim() || null : null;
  const materialId =
    typeof body.materialId === "string" ? body.materialId : null;
  const page =
    typeof body.page === "number" && Number.isFinite(body.page)
      ? body.page
      : null;

  await db
    .prepare(
      `INSERT INTO atlas_entry_refs (
         id, entry_id, field_key, citation, url, material_id, page, note,
         user_added, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(id, row.id, fieldKey, citation, url, materialId, page, note, createdAt)
    .run();

  return c.json(
    {
      id,
      field: fieldKey,
      citation,
      url,
      note,
      materialId,
      page,
      createdAt,
    },
    201,
  );
});

atlasRoutes.delete("/entries/:entryId/refs/:refId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  const refId = requireParam(c, "refId");
  const row =
    (await findEntryById(db, atlas.id, entryId)) ??
    (await findEntryByOrigin(db, atlas.id, entryId));
  if (!row) throw new HTTPException(404, { message: "Entry not found" });

  const result = await db
    .prepare(`DELETE FROM atlas_entry_refs WHERE id = ? AND entry_id = ?`)
    .bind(refId, row.id)
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(404, { message: "Ref not found" });
  }
  return c.body(null, 204);
});

atlasRoutes.post("/entries/:entryId/images/upload-url", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  let body: { contentType?: unknown; size?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(contentType)) {
    throw new HTTPException(400, {
      message: "Only jpeg/png/webp uploads are allowed",
    });
  }
  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, { message: "Image must be 10MB or smaller" });
  }

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });
  let row: EntryRow;
  if (resolved.kind === "dataset") {
    row = await insertOverlayFromDataset(db, atlas.id, resolved.entry, {
      editedAt: nowIso(),
    });
  } else {
    if (resolved.row.deleted_at) {
      throw new HTTPException(409, { message: "Entry is deleted" });
    }
    row = resolved.row;
  }

  const imageId = newId();
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  const r2Key = `atlas/${atlas.id}/${row.id}/${imageId}.${ext}`;

  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }

  const uploadUrl = await createR2PutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    contentType,
    contentLength: size,
  });

  return c.json({ imageId, uploadUrl, r2Key, entryId: row.id });
});

atlasRoutes.post("/entries/:entryId/images", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  let body: {
    src?: unknown;
    role?: unknown;
    caption?: unknown;
    credit?: unknown;
    license?: unknown;
    sourceUrl?: unknown;
    isHero?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const src = typeof body.src === "string" ? body.src.trim() : "";
  if (!src) throw new HTTPException(400, { message: "src required" });
  const role =
    typeof body.role === "string" &&
    (IMAGE_ROLES as readonly string[]).includes(body.role)
      ? body.role
      : null;
  if (!role) throw new HTTPException(400, { message: "Valid role required" });

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });
  let row: EntryRow;
  if (resolved.kind === "dataset") {
    row = await insertOverlayFromDataset(db, atlas.id, resolved.entry, {
      editedAt: nowIso(),
    });
  } else {
    if (resolved.row.deleted_at) {
      throw new HTTPException(409, { message: "Entry is deleted" });
    }
    row = resolved.row;
  }

  const id = newId();
  const createdAt = nowIso();
  const caption =
    typeof body.caption === "string" ? body.caption.trim() || null : null;
  const credit =
    typeof body.credit === "string" ? body.credit.trim() || null : null;
  const license =
    typeof body.license === "string" ? body.license.trim() || null : null;
  const sourceUrl =
    typeof body.sourceUrl === "string" ? body.sourceUrl.trim() || null : null;
  const isHero = body.isHero === true ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO atlas_entry_images (
         id, entry_id, src, role, caption, credit, license, source_url,
         is_hero, user_added, deleted_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)`,
    )
    .bind(
      id,
      row.id,
      src,
      role,
      caption,
      credit,
      license,
      sourceUrl,
      isHero,
      createdAt,
    )
    .run();

  return c.json(
    {
      id,
      src,
      role,
      caption,
      credit,
      license,
      sourceUrl,
      isHero: isHero === 1,
      createdAt,
    },
    201,
  );
});

atlasRoutes.delete("/entries/:entryId/images/:imageId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "subjectId"));
  const entryId = requireParam(c, "entryId");
  const imageId = requireParam(c, "imageId");
  const row =
    (await findEntryById(db, atlas.id, entryId)) ??
    (await findEntryByOrigin(db, atlas.id, entryId));
  if (!row) throw new HTTPException(404, { message: "Entry not found" });

  const ts = nowIso();
  const result = await db
    .prepare(
      `UPDATE atlas_entry_images SET deleted_at = ?
       WHERE id = ? AND entry_id = ? AND deleted_at IS NULL`,
    )
    .bind(ts, imageId, row.id)
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(404, { message: "Image not found" });
  }
  return c.body(null, 204);
});
