import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { overlayAtlas } from "./merge";
import {
  enrichEntriesWithFocus,
  focusEntryKey,
  isFocusPackFresh,
  listEntriesWithFocus,
  loadFocusMap,
  refreshFocusBestEffort,
  setFocusOverride,
} from "./focus";
import {
  deleteEntryNote,
  enrichAtlasEntriesWithNotes,
  normalizeNoteBody,
  noteEntryKey,
  upsertEntryNote,
} from "./notes";
import {
  hasLearnerRefsOrImages,
  loadEntryRows,
  toOverlayRows,
  type EntryRow,
} from "./entryOverlays";
import { loadParasiteDataset } from "./datasets/parasites/index";
import { normalizeParasiteName } from "./names";
import { emptyParasiteFields } from "./templates/parasite";
import { applySandboxKeyPrefix, sandboxWriteUserId } from "../admin/sandbox-r2";
import { createR2PutUrl } from "../materials/r2-presign";
import { sha256Hex } from "../materials/content-hash";
import { requireOwnedDeck } from "../materials/routes";
import { enqueueGeneration } from "../generation/enqueue";
import type { AppEnv } from "./types";
import {
  atlasMeta,
  newId,
  nowIso,
  requireOwnedAtlas,
  requireParam,
} from "./ownership";
import {
  datasetByCanonical,
  datasetByKey,
  deletedEntryViews,
  findEntryById,
  findEntryByOrigin,
  insertOverlayFromDataset,
  mergeFields,
  parseFieldsPatch,
  parseFocusOverride,
  parseResetFields,
  planEntryWrite,
  resolveEntry,
} from "./entry-helpers";
import {
  parseMakeCardsDeckId,
  parseMakeCardsEntryKeys,
  prepareMakeCardsItems,
} from "./make-cards-body";
import {
  imageExtForContentType,
  parseAtlasImageCreateBody,
  parseAtlasImageUploadBody,
  parseAtlasRefBody,
} from "./atlas-media-body";

const DEFAULT_R2_BUCKET = "sugarplum-materials";

export const atlasItemRoutes = new Hono<AppEnv>();

async function entryViewsWithNotes(
  db: D1Database,
  atlasId: string,
  entries: Awaited<ReturnType<typeof enrichEntriesWithFocus>>,
) {
  return enrichAtlasEntriesWithNotes(db, atlasId, entries);
}

function scheduleFocusRefresh(
  c: Context<AppEnv>,
): ((promise: Promise<unknown>) => void) | undefined {
  // Hono throws when a request has no execution context (Vitest app.request).
  try {
    const ctx = c.executionCtx;
    return (promise) => ctx.waitUntil(promise);
  } catch {
    return undefined;
  }
}

atlasItemRoutes.get("/", async (c) => {
  const { atlas } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  return c.json(atlasMeta(atlas));
});

atlasItemRoutes.get("/entries", async (c) => {
  const { atlas, db, userId } = await requireOwnedAtlas(
    c,
    requireParam(c, "atlasId"),
  );
  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const merged = overlayAtlas(loadParasiteDataset().entries, overlays);
  const skipMutatingRefresh = Boolean(c.get("viewingAs"));
  const { entries, focusRefreshPending } = await listEntriesWithFocus(
    db,
    c.env,
    {
      atlasId: atlas.id,
      userId,
      entries: merged,
      schedule: skipMutatingRefresh ? undefined : scheduleFocusRefresh(c),
      skipMutatingRefresh,
    },
  );
  const withNotes = await enrichAtlasEntriesWithNotes(db, atlas.id, entries);
  return c.json({ entries: withNotes, focusRefreshPending });
});

atlasItemRoutes.get("/deleted", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const entries = await enrichAtlasEntriesWithNotes(
    db,
    atlas.id,
    deletedEntryViews(rows, overlays, datasetByKey()),
  );
  return c.json({ entries });
});

atlasItemRoutes.post("/make-cards", async (c) => {
  const { atlas, db, userId } = await requireOwnedAtlas(
    c,
    requireParam(c, "atlasId"),
  );
  let body: { deckId?: unknown; entryKeys?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const deckId = parseMakeCardsDeckId(body);
  await requireOwnedDeck(db, deckId, userId);
  const entryKeys = parseMakeCardsEntryKeys(body);

  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const merged = overlayAtlas(loadParasiteDataset().entries, overlays);
  // Await Focus so Key tiers are consistent before enqueue (no waitUntil).
  const { entries } = await listEntriesWithFocus(db, c.env, {
    atlasId: atlas.id,
    userId,
    entries: merged,
  });

  const prepared = prepareMakeCardsItems(entries, entryKeys);
  const sandboxId = await sandboxWriteUserId(db, userId);

  const jobs: Array<{
    entryKey: string;
    materialId: string;
    jobId: string;
  }> = [];

  for (const item of prepared) {
    const materialId = newId();
    const createdAt = nowIso();
    const filename = `atlas-${item.entryKey}.txt`;
    const r2Key = applySandboxKeyPrefix(
      sandboxId,
      `materials/${deckId}/${materialId}.txt`,
    );
    const contentHash = await sha256Hex(item.text);

    await c.env.MATERIALS.put(r2Key, item.text, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });

    await db
      .prepare(
        "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at, content_hash, source_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        materialId,
        deckId,
        "paste",
        r2Key,
        filename,
        null,
        "ready",
        createdAt,
        contentHash,
        "notes",
      )
      .run();

    const jobId = await enqueueGeneration(c.env, {
      materialId,
      deckId,
      topicHints: item.topicHints,
      atlasEntryId: item.entryKey,
      atlasCitations: item.citations,
    });

    jobs.push({ entryKey: item.entryKey, materialId, jobId });
  }

  return c.json(
    {
      deckId,
      jobs,
      jobId: jobs[0]?.jobId ?? null,
    },
    201,
  );
});

atlasItemRoutes.post("/entries", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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
    typeof body.commonName === "string" ? body.commonName.trim() : "";
  if (!commonName) {
    throw new HTTPException(400, { message: "commonName required" });
  }

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
  const focused = enrichEntriesWithFocus(
    overlayAtlas(loadParasiteDataset().entries, overlays),
    focus,
    await isFocusPackFresh(db, atlas.id),
  );
  const view = (await entryViewsWithNotes(db, atlas.id, focused)).find(
    (e) => e.id === row.id,
  );
  if (!view)
    throw new HTTPException(500, { message: "Failed to create entry" });
  return c.json(view, 201);
});

atlasItemRoutes.patch("/entries/:entryId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const entryId = requireParam(c, "entryId");
  let body: {
    commonName?: unknown;
    resetFields?: unknown;
    fields?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const fieldsPatch = parseFieldsPatch(body.fields);
  const resetFields = parseResetFields(body.resetFields);
  const commonNameProvided = "commonName" in body;
  let commonName: string | undefined;
  if (commonNameProvided) {
    if (typeof body.commonName !== "string" || !body.commonName.trim()) {
      throw new HTTPException(400, { message: "commonName required" });
    }
    commonName = body.commonName.trim();
  }

  if (
    fieldsPatch === undefined &&
    !commonNameProvided &&
    resetFields === undefined
  ) {
    throw new HTTPException(400, { message: "No changes" });
  }

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });

  const ts = nowIso();
  const input = { fieldsPatch, resetFields, commonName };
  let row: EntryRow | null = null;

  if (resolved.kind === "dataset") {
    // A reset on an entry with no overlay has nothing to remove; do not create a row.
    const onlyReset = fieldsPatch === undefined && !commonNameProvided;
    if (!onlyReset) {
      row = await insertOverlayFromDataset(db, atlas.id, resolved.entry, {
        plan: planEntryWrite(null, resolved.entry, input),
        editedAt: ts,
      });
    }
  } else {
    if (resolved.row.deleted_at) {
      throw new HTTPException(409, { message: "Entry is deleted" });
    }
    const dataset = resolved.row.origin_key
      ? (datasetByKey().get(resolved.row.origin_key) ?? null)
      : null;
    const plan = planEntryWrite(resolved.row, dataset, input);
    await db
      .prepare(
        `UPDATE atlas_entries
         SET common_name = ?, fields_json = ?, field_overrides_json = ?, edited_at = ?, updated_at = ?,
             status = 'accepted', canonical_name = ?, aliases_json = ?
         WHERE id = ? AND atlas_id = ?`,
      )
      .bind(
        plan.commonName,
        plan.fieldsJson,
        plan.overridesJson,
        ts,
        ts,
        resolved.row.canonical_name,
        resolved.row.aliases_json ?? null,
        resolved.row.id,
        atlas.id,
      )
      .run();
    const updated = await findEntryById(db, atlas.id, resolved.row.id);
    if (!updated) throw new HTTPException(404, { message: "Entry not found" });
    row = updated;
  }

  // Names feed scanFocus (and Phase 2 pack matching).
  if (commonNameProvided) {
    await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  }
  const overlays = row ? await toOverlayRows(db, atlas.id, [row]) : [];
  const focus = await loadFocusMap(db, atlas.id);
  const views = await entryViewsWithNotes(
    db,
    atlas.id,
    enrichEntriesWithFocus(
      overlayAtlas(loadParasiteDataset().entries, overlays),
      focus,
      await isFocusPackFresh(db, atlas.id),
    ),
  );
  const viewId = row?.id ?? entryId;
  const view = views.find((v) => v.id === viewId) ?? views[0];
  return c.json(view);
});

atlasItemRoutes.patch("/entries/:entryId/focus", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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
  const entries = await entryViewsWithNotes(
    db,
    atlas.id,
    enrichEntriesWithFocus(
      overlayAtlas(loadParasiteDataset().entries, overlays),
      focus,
      await isFocusPackFresh(db, atlas.id),
    ),
  );
  const view = entries.find((e) => focusEntryKey(e) === entryKey);
  if (!view) throw new HTTPException(404, { message: "Entry not found" });
  return c.json(view);
});

atlasItemRoutes.put("/entries/:entryId/note", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const entryId = requireParam(c, "entryId");
  let body: { body?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (!("body" in body)) {
    throw new HTTPException(400, { message: "body required" });
  }
  const normalized = normalizeNoteBody(body.body);

  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });
  if (resolved.kind === "row" && resolved.row.deleted_at) {
    throw new HTTPException(409, { message: "Entry is deleted" });
  }

  const entryKey = noteEntryKey(resolved);
  if (normalized === "clear") {
    await deleteEntryNote(db, atlas.id, entryKey);
  } else {
    await upsertEntryNote(db, atlas.id, entryKey, normalized.body, nowIso());
  }

  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const focus = await loadFocusMap(db, atlas.id);
  const entries = await entryViewsWithNotes(
    db,
    atlas.id,
    enrichEntriesWithFocus(
      overlayAtlas(loadParasiteDataset().entries, overlays),
      focus,
      await isFocusPackFresh(db, atlas.id),
    ),
  );
  const view = entries.find((e) => focusEntryKey(e) === entryKey);
  if (!view) throw new HTTPException(404, { message: "Entry not found" });
  return c.json(view);
});

atlasItemRoutes.delete("/entries/:entryId/note", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const entryId = requireParam(c, "entryId");
  const resolved = await resolveEntry(db, atlas.id, entryId);
  if (!resolved) throw new HTTPException(404, { message: "Entry not found" });
  if (resolved.kind === "row" && resolved.row.deleted_at) {
    throw new HTTPException(409, { message: "Entry is deleted" });
  }

  const entryKey = noteEntryKey(resolved);
  await deleteEntryNote(db, atlas.id, entryKey);

  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const focus = await loadFocusMap(db, atlas.id);
  const entries = await entryViewsWithNotes(
    db,
    atlas.id,
    enrichEntriesWithFocus(
      overlayAtlas(loadParasiteDataset().entries, overlays),
      focus,
      await isFocusPackFresh(db, atlas.id),
    ),
  );
  const view = entries.find((e) => focusEntryKey(e) === entryKey);
  if (!view) throw new HTTPException(404, { message: "Entry not found" });
  return c.json(view);
});

atlasItemRoutes.post("/entries/:entryId/soft-delete", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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

atlasItemRoutes.post("/entries/:entryId/restore", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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

atlasItemRoutes.post("/entries/:entryId/reset", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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

atlasItemRoutes.delete("/entries/:entryId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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
  await deleteEntryNote(db, atlas.id, row.id);
  await db
    .prepare(`DELETE FROM atlas_entries WHERE id = ? AND atlas_id = ?`)
    .bind(row.id, atlas.id)
    .run();
  await refreshFocusBestEffort(db, c.env, { atlasId: atlas.id });
  return c.body(null, 204);
});

atlasItemRoutes.post("/entries/:entryId/refs", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const entryId = requireParam(c, "entryId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const ref = parseAtlasRefBody(
    body && typeof body === "object" ? (body as Record<string, unknown>) : {},
  );

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

  await db
    .prepare(
      `INSERT INTO atlas_entry_refs (
         id, entry_id, field_key, citation, url, material_id, page, note,
         user_added, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(
      id,
      row.id,
      ref.fieldKey,
      ref.citation,
      ref.url,
      ref.materialId,
      ref.page,
      ref.note,
      createdAt,
    )
    .run();

  return c.json(
    {
      id,
      field: ref.fieldKey,
      citation: ref.citation,
      url: ref.url,
      note: ref.note,
      materialId: ref.materialId,
      page: ref.page,
      createdAt,
    },
    201,
  );
});

atlasItemRoutes.delete("/entries/:entryId/refs/:refId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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

atlasItemRoutes.post("/entries/:entryId/images/upload-url", async (c) => {
  const { atlas, db, userId } = await requireOwnedAtlas(
    c,
    requireParam(c, "atlasId"),
  );
  const entryId = requireParam(c, "entryId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const { contentType, size } = parseAtlasImageUploadBody(
    body && typeof body === "object" ? (body as Record<string, unknown>) : {},
  );

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
  const ext = imageExtForContentType(contentType);
  const sandboxId = await sandboxWriteUserId(db, userId);
  const r2Key = applySandboxKeyPrefix(
    sandboxId,
    `atlas/${atlas.id}/${row.id}/${imageId}.${ext}`,
  );

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

atlasItemRoutes.post("/entries/:entryId/images", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const entryId = requireParam(c, "entryId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const image = parseAtlasImageCreateBody(
    body && typeof body === "object" ? (body as Record<string, unknown>) : {},
  );

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
  const isHero = image.isHero ? 1 : 0;

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
      image.src,
      image.role,
      image.caption,
      image.credit,
      image.license,
      image.sourceUrl,
      isHero,
      createdAt,
    )
    .run();

  return c.json(
    {
      id,
      src: image.src,
      role: image.role,
      caption: image.caption,
      credit: image.credit,
      license: image.license,
      sourceUrl: image.sourceUrl,
      isHero: isHero === 1,
      createdAt,
    },
    201,
  );
});

atlasItemRoutes.delete("/entries/:entryId/images/:imageId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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
