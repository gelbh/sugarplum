import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { overlayAtlas } from "./merge";
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
import { loadParasiteDataset } from "./datasets/parasites";
import { IMAGE_ROLES } from "./datasets/schema";
import { normalizeParasiteName } from "./names";
import { emptyParasiteFields, type ParasiteFields } from "./templates/parasite";
import { createR2PutUrl } from "../materials/r2-presign";
import { sha256Hex } from "../materials/content-hash";
import { MAX_PASTE_BYTES } from "../materials/limits";
import { requireOwnedDeck } from "../materials/routes";
import { enqueueGeneration } from "../generation/enqueue";
import { normalizeTopicHints } from "../generation/topic-hints";
import { buildAtlasMakeCardsSource } from "./makeCardsSource";
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
  resolveEntry,
} from "./entry-helpers";

const MAX_MAKE_CARDS_ENTRIES = 8;
const DEFAULT_R2_BUCKET = "sugarplum-materials";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const atlasItemRoutes = new Hono<AppEnv>();

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
  const entries = await listEntriesWithFocus(db, c.env, {
    atlasId: atlas.id,
    userId,
    entries: merged,
  });
  return c.json({ entries });
});

atlasItemRoutes.get("/deleted", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const entries = deletedEntryViews(rows, overlays, datasetByKey());
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

  const deckId = typeof body.deckId === "string" ? body.deckId.trim() : "";
  if (!deckId) throw new HTTPException(400, { message: "deckId required" });
  await requireOwnedDeck(db, deckId, userId);

  const rawKeys = Array.isArray(body.entryKeys) ? body.entryKeys : [];
  const entryKeys = [
    ...new Set(
      rawKeys
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ];
  if (entryKeys.length === 0) {
    throw new HTTPException(400, { message: "entryKeys required" });
  }
  if (entryKeys.length > MAX_MAKE_CARDS_ENTRIES) {
    throw new HTTPException(400, {
      message: `At most ${MAX_MAKE_CARDS_ENTRIES} entries per request`,
    });
  }

  const rows = await loadEntryRows(db, atlas.id);
  const overlays = await toOverlayRows(db, atlas.id, rows);
  const merged = overlayAtlas(loadParasiteDataset().entries, overlays);
  const entries = await listEntriesWithFocus(db, c.env, {
    atlasId: atlas.id,
    userId,
    entries: merged,
  });

  // Resolve + validate every entry before any R2/D1/queue write (no partial queue).
  const prepared: Array<{
    entryKey: string;
    text: string;
    citations: string[];
    topicHints: string[];
  }> = [];
  for (const key of entryKeys) {
    const hit =
      entries.find((e) => e.id === key) ??
      entries.find((e) => e.originKey === key) ??
      null;
    if (!hit) {
      throw new HTTPException(404, { message: `Entry not found: ${key}` });
    }
    const entryKey = hit.originKey ?? hit.id;
    const source = buildAtlasMakeCardsSource({
      entryKey,
      canonicalName: hit.canonicalName,
      commonName: hit.commonName,
      aliases: hit.aliases,
      fields: hit.fields,
      refs: hit.refs,
    });
    const textBytes = new TextEncoder().encode(source.text).byteLength;
    if (textBytes > MAX_PASTE_BYTES) {
      throw new HTTPException(400, {
        message: `Atlas source for ${hit.canonicalName} exceeds paste size`,
      });
    }
    let topicHints: string[];
    try {
      topicHints = normalizeTopicHints(source.topicHints) ?? [];
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid topicHints",
      });
    }
    prepared.push({
      entryKey,
      text: source.text,
      citations: source.citations,
      topicHints,
    });
  }

  const jobs: Array<{
    entryKey: string;
    materialId: string;
    jobId: string;
  }> = [];

  for (const item of prepared) {
    const materialId = newId();
    const createdAt = nowIso();
    const filename = `atlas-${item.entryKey}.txt`;
    const r2Key = `materials/${deckId}/${materialId}.txt`;
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
  const view = enrichEntriesWithFocus(
    overlayAtlas(loadParasiteDataset().entries, overlays),
    focus,
  ).find((e) => e.id === row.id);
  if (!view)
    throw new HTTPException(500, { message: "Failed to create entry" });
  return c.json(view, 201);
});

atlasItemRoutes.patch("/entries/:entryId", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
  const entryId = requireParam(c, "entryId");
  let body: { commonName?: unknown; fields?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const fieldsPatch = parseFieldsPatch(body.fields);
  const commonNameProvided = "commonName" in body;
  let commonName: string | undefined;
  if (commonNameProvided) {
    if (typeof body.commonName !== "string" || !body.commonName.trim()) {
      throw new HTTPException(400, { message: "commonName required" });
    }
    commonName = body.commonName.trim();
  }

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
  const entries = enrichEntriesWithFocus(
    overlayAtlas(loadParasiteDataset().entries, overlays),
    focus,
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
  const url = typeof body.url === "string" ? body.url.trim() || null : null;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
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
    .bind(
      id,
      row.id,
      fieldKey,
      citation,
      url,
      materialId,
      page,
      note,
      createdAt,
    )
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
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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

atlasItemRoutes.post("/entries/:entryId/images", async (c) => {
  const { atlas, db } = await requireOwnedAtlas(c, requireParam(c, "atlasId"));
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
