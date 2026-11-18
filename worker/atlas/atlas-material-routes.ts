import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import {
  applySandboxKeyPrefix,
  filterDeletableR2Keys,
  sandboxWriteUserId,
} from "../admin/sandbox-r2";
import { sha256Hex } from "../materials/content-hash";
import { MAX_FILE_BYTES, MAX_PASTE_BYTES } from "../materials/limits";
import {
  atlasOcrSidecarKey,
  parseOcrPages,
  writeAtlasOcrSidecar,
} from "../materials/ocr-sidecar";
import { createR2PutUrl } from "../materials/r2-presign";
import {
  assertConfiguredR2AccountId,
  DEFAULT_R2_BUCKET,
  FILE_READY,
  FILE_UPLOADING,
  PASTE_READY,
  PPTX_CONTENT_TYPE,
  resolveSourceRole,
  resolveUpload,
} from "../materials/upload";
import { isSourceRole } from "../../src/lib/sourceRole";
import { refreshFocusBestEffort } from "./focus";
import type { AppEnv } from "./types";
import {
  newId,
  requireOwnedAtlas,
  requireParam,
} from "./ownership";

export type AtlasMaterialRow = {
  id: string;
  atlas_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  content_hash?: string | null;
  source_role: string;
};

function materialJson(row: AtlasMaterialRow) {
  return {
    id: row.id,
    atlas_id: row.atlas_id,
    kind: row.kind,
    r2_key: row.r2_key,
    filename: row.filename,
    page_count: row.page_count,
    status: row.status,
    created_at: row.created_at,
    source_role: row.source_role,
  };
}

async function requireOwnedAtlasMaterial(
  db: D1Database,
  materialId: string,
  userId: string,
): Promise<AtlasMaterialRow> {
  const row = await db
    .prepare(
      `SELECT m.id, m.atlas_id, m.kind, m.r2_key, m.filename, m.page_count,
              m.status, m.created_at, m.content_hash, m.source_role
       FROM atlas_materials m
       INNER JOIN atlases a ON a.id = m.atlas_id
       WHERE m.id = ? AND a.user_id = ?`,
    )
    .bind(materialId, userId)
    .first<AtlasMaterialRow>();
  if (!row) throw new HTTPException(404, { message: "Material not found" });
  return row;
}

/** Nested under /api/atlas/:atlasId */
export const atlasPackRoutes = new Hono<AppEnv>();

atlasPackRoutes.get("/materials", async (c) => {
  const atlasId = requireParam(c, "atlasId");
  const { db } = await requireOwnedAtlas(c, atlasId);
  const { results } = await db
    .prepare(
      `SELECT id, atlas_id, kind, r2_key, filename, page_count, status,
              created_at, source_role
       FROM atlas_materials
       WHERE atlas_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(atlasId)
    .all<AtlasMaterialRow>();
  return c.json({
    materials: (results ?? []).map(materialJson),
  });
});

atlasPackRoutes.post("/materials/paste", async (c) => {
  const atlasId = requireParam(c, "atlasId");
  const { userId, db } = await requireOwnedAtlas(c, atlasId);

  let body: {
    text?: unknown;
    filename?: unknown;
    source_role?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new HTTPException(400, { message: "Text required" });
  const textBytes = new TextEncoder().encode(text).byteLength;
  if (textBytes > MAX_PASTE_BYTES) {
    throw new HTTPException(400, {
      message: "Paste must be 100KB or smaller",
    });
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : null;
  const sourceRole = resolveSourceRole(body.source_role, filename);
  const contentHash = await sha256Hex(text);
  const id = newId();
  const createdAt = new Date().toISOString();
  const sandboxId = await sandboxWriteUserId(db, userId);
  const r2Key = applySandboxKeyPrefix(
    sandboxId,
    `atlas/${atlasId}/${id}.txt`,
  );

  await c.env.MATERIALS.put(r2Key, text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  await db
    .prepare(
      `INSERT INTO atlas_materials (
         id, atlas_id, kind, r2_key, filename, page_count, status,
         created_at, content_hash, source_role
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      atlasId,
      "paste",
      r2Key,
      filename,
      null,
      PASTE_READY,
      createdAt,
      contentHash,
      sourceRole,
    )
    .run();

  await refreshFocusBestEffort(db, c.env, { atlasId });

  return c.json(
    materialJson({
      id,
      atlas_id: atlasId,
      kind: "paste",
      r2_key: r2Key,
      filename,
      page_count: null,
      status: PASTE_READY,
      created_at: createdAt,
      content_hash: contentHash,
      source_role: sourceRole,
    }),
    201,
  );
});

atlasPackRoutes.post("/materials/upload-url", async (c) => {
  const atlasId = requireParam(c, "atlasId");
  const { userId, db } = await requireOwnedAtlas(c, atlasId);

  let body: {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    source_role?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";
  const filenameHint =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "";
  const resolved = resolveUpload(contentType, filenameHint);
  if (!resolved || (resolved.kind !== "pdf" && resolved.kind !== "pptx")) {
    throw new HTTPException(400, {
      message: "Only PDF or PPTX uploads are allowed",
    });
  }

  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_FILE_BYTES) {
    throw new HTTPException(400, {
      message: `File must be ${MAX_FILE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }

  const defaultName = `upload.${resolved.ext}`;
  const filename = filenameHint || defaultName;
  const sourceRole = resolveSourceRole(body.source_role, filename);
  const putContentType =
    resolved.kind === "pptx" ? PPTX_CONTENT_TYPE : contentType;

  const materialId = newId();
  const createdAt = new Date().toISOString();
  const sandboxId = await sandboxWriteUserId(db, userId);
  const r2Key = applySandboxKeyPrefix(
    sandboxId,
    `atlas/${atlasId}/${materialId}.${resolved.ext}`,
  );

  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }
  assertConfiguredR2AccountId(accountId);

  const uploadUrl = await createR2PutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    contentType: putContentType,
    contentLength: size,
  });

  await db
    .prepare(
      `INSERT INTO atlas_materials (
         id, atlas_id, kind, r2_key, filename, page_count, status,
         created_at, source_role
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      materialId,
      atlasId,
      resolved.kind,
      r2Key,
      filename,
      null,
      FILE_UPLOADING,
      createdAt,
      sourceRole,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});

/** Flat routes under /api/atlas/materials/:id */
export const atlasMaterialItemRoutes = new Hono<AppEnv>();

atlasMaterialItemRoutes.post("/:id/complete", async (c) => {
  const userId = await requireUser(c);
  const materialId = requireParam(c, "id");
  const db = getDb(c.env);
  const material = await requireOwnedAtlasMaterial(db, materialId, userId);

  if (material.status === FILE_READY) {
    return c.json({ ...materialJson(material), jobId: null });
  }

  let ocrPages: ReturnType<typeof parseOcrPages>;
  const rawBody = await c.req.text();
  if (rawBody.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
    const body = parsed as { ocrPages?: unknown };
    try {
      ocrPages = parseOcrPages(body.ocrPages);
    } catch {
      throw new HTTPException(400, { message: "Invalid ocrPages" });
    }
    if (ocrPages && material.kind !== "pdf") {
      throw new HTTPException(400, { message: "Invalid ocrPages" });
    }
  } else {
    ocrPages = undefined;
  }

  let contentHash: string | null = null;
  if (material.r2_key) {
    const obj = await c.env.MATERIALS.get(material.r2_key);
    if (!obj) {
      throw new HTTPException(409, {
        message:
          "Uploaded file not found in storage. Retry the upload, or enable remote R2 for local dev.",
      });
    }
    contentHash = await sha256Hex(await obj.arrayBuffer());
  }

  const cas = await db
    .prepare(
      `UPDATE atlas_materials SET status = ?, content_hash = ?
       WHERE id = ? AND status = ?`,
    )
    .bind(FILE_READY, contentHash, materialId, FILE_UPLOADING)
    .run();
  if (!cas.meta.changes) {
    throw new HTTPException(409, {
      message: "Material is not awaiting upload completion",
    });
  }

  if (ocrPages && material.kind === "pdf") {
    try {
      await writeAtlasOcrSidecar(c.env, material.atlas_id, materialId, ocrPages);
    } catch (err) {
      console.warn("atlas OCR sidecar write failed", err);
    }
  }

  await refreshFocusBestEffort(db, c.env, { atlasId: material.atlas_id });

  return c.json({
    ...materialJson({ ...material, status: FILE_READY }),
    jobId: null,
  });
});

atlasMaterialItemRoutes.patch("/:id", async (c) => {
  const userId = await requireUser(c);
  const materialId = requireParam(c, "id");
  const db = getDb(c.env);
  const material = await requireOwnedAtlasMaterial(db, materialId, userId);

  let body: { source_role?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (!isSourceRole(body.source_role)) {
    throw new HTTPException(400, { message: "Valid source_role required" });
  }
  const sourceRole = body.source_role;

  await db
    .prepare("UPDATE atlas_materials SET source_role = ? WHERE id = ?")
    .bind(sourceRole, materialId)
    .run();

  await refreshFocusBestEffort(db, c.env, { atlasId: material.atlas_id });

  return c.json(materialJson({ ...material, source_role: sourceRole }));
});

atlasMaterialItemRoutes.delete("/:id", async (c) => {
  const userId = await requireUser(c);
  const materialId = requireParam(c, "id");
  const db = getDb(c.env);
  const material = await requireOwnedAtlasMaterial(db, materialId, userId);

  const keys = new Set<string>();
  if (material.r2_key?.trim()) keys.add(material.r2_key.trim());
  const sandboxId = await sandboxWriteUserId(db, userId);
  keys.add(atlasOcrSidecarKey(material.atlas_id, material.id, sandboxId));
  keys.add(atlasOcrSidecarKey(material.atlas_id, material.id));

  await db
    .prepare("DELETE FROM atlas_materials WHERE id = ?")
    .bind(material.id)
    .run();

  for (const key of await filterDeletableR2Keys(db, userId, keys)) {
    try {
      await c.env.MATERIALS.delete(key);
    } catch {
      /* best-effort */
    }
  }

  await refreshFocusBestEffort(db, c.env, { atlasId: material.atlas_id });

  return c.body(null, 204);
});
