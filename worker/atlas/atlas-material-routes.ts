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
import { extractPptxSlides } from "../materials/extract-pptx";
import {
  atlasOcrSidecarKey,
  OCR_PAGE_CHAR_CAP,
  parseOcrPages,
  readAtlasOcrSidecar,
  writeAtlasOcrSidecar,
  writeOcrSidecar,
} from "../materials/ocr-sidecar";
import { requireOwnedDeck } from "../materials/ownership";
import { parsePasteMaterialBody } from "../materials/paste-material";
import { createR2PutUrl } from "../materials/r2-presign";
import {
  DEFAULT_R2_BUCKET,
  FILE_READY,
  FILE_UPLOADING,
  PASTE_READY,
  contentTypeForMaterial,
} from "../materials/upload";
import {
  parseUploadUrlRequest,
  requireR2UploadCredentials,
} from "../materials/upload-request";
import { isSourceRole } from "../../src/lib/sourceRole";
import { refreshFocusBestEffort } from "./focus";
import type { AppEnv } from "./types";
import {
  newId,
  requireOwnedAtlas,
  requireParam,
} from "./ownership";

const ATLAS_UPLOAD_KINDS = new Set(["pdf", "pptx"] as const);

function extForAtlasKind(kind: string): string {
  if (kind === "paste") return "txt";
  if (kind === "pptx") return "pptx";
  return "pdf";
}

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

  const { text, filename, sourceRole } = parsePasteMaterialBody(body);
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

  const { filename, size, sourceRole, resolved, putContentType } =
    parseUploadUrlRequest(body, {
      allowKinds: ATLAS_UPLOAD_KINDS,
      rejectMessage: "Only PDF or PPTX uploads are allowed",
    });

  const materialId = newId();
  const createdAt = new Date().toISOString();
  const sandboxId = await sandboxWriteUserId(db, userId);
  const r2Key = applySandboxKeyPrefix(
    sandboxId,
    `atlas/${atlasId}/${materialId}.${resolved.ext}`,
  );

  const { accountId, accessKeyId, secretAccessKey } =
    requireR2UploadCredentials(c.env);

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
  let fileBytes: ArrayBuffer | null = null;
  if (material.r2_key) {
    const obj = await c.env.MATERIALS.get(material.r2_key);
    if (!obj) {
      throw new HTTPException(409, {
        message:
          "Uploaded file not found in storage. Retry the upload, or enable remote R2 for local dev.",
      });
    }
    fileBytes = await obj.arrayBuffer();
    contentHash = await sha256Hex(fileBytes);
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

  let pageCount = material.page_count;
  if (ocrPages && material.kind === "pdf") {
    try {
      await writeAtlasOcrSidecar(c.env, material.atlas_id, materialId, ocrPages);
    } catch (err) {
      console.warn("atlas OCR sidecar write failed", err);
    }
  } else if (material.kind === "pptx" && fileBytes) {
    try {
      const extracted = await extractPptxSlides(fileBytes);
      const pages = extracted.pages.map((p) => ({
        page: p.page,
        text: p.text.slice(0, OCR_PAGE_CHAR_CAP),
      }));
      if (pages.some((p) => p.text.trim())) {
        await writeAtlasOcrSidecar(
          c.env,
          material.atlas_id,
          materialId,
          pages,
        );
      }
      pageCount = extracted.totalPages;
      await db
        .prepare("UPDATE atlas_materials SET page_count = ? WHERE id = ?")
        .bind(pageCount, materialId)
        .run();
    } catch (err) {
      console.warn("atlas PPTX extract failed", err);
    }
  }

  await refreshFocusBestEffort(db, c.env, { atlasId: material.atlas_id });

  return c.json({
    ...materialJson({
      ...material,
      status: FILE_READY,
      page_count: pageCount,
    }),
    jobId: null,
  });
});

atlasMaterialItemRoutes.post("/:id/promote", async (c) => {
  const userId = await requireUser(c);
  const materialId = requireParam(c, "id");
  const db = getDb(c.env);
  const material = await requireOwnedAtlasMaterial(db, materialId, userId);

  if (material.status !== FILE_READY && material.status !== PASTE_READY) {
    throw new HTTPException(409, {
      message: "Material must be ready before promoting to a deck",
    });
  }
  if (!material.r2_key) {
    throw new HTTPException(409, {
      message: "Material has no stored file to promote",
    });
  }

  let body: { deckId?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const deckId =
    typeof body.deckId === "string" && body.deckId.trim()
      ? body.deckId.trim()
      : "";
  if (!deckId) {
    throw new HTTPException(400, { message: "deckId required" });
  }
  await requireOwnedDeck(db, deckId, userId);

  const src = await c.env.MATERIALS.get(material.r2_key);
  if (!src) {
    throw new HTTPException(409, {
      message: "Pack file not found in storage",
    });
  }

  const destMaterialId = newId();
  const createdAt = new Date().toISOString();
  const sandboxId = await sandboxWriteUserId(db, userId);
  const ext = extForAtlasKind(material.kind);
  const destKey = applySandboxKeyPrefix(
    sandboxId,
    `materials/${deckId}/${destMaterialId}.${ext}`,
  );
  const bytes = await src.arrayBuffer();
  await c.env.MATERIALS.put(destKey, bytes, {
    httpMetadata: {
      contentType: contentTypeForMaterial(
        material.kind,
        destKey,
        material.filename,
      ),
    },
  });

  const contentHash =
    material.content_hash ?? (await sha256Hex(bytes));

  await db
    .prepare(
      `INSERT INTO materials (
         id, deck_id, kind, r2_key, filename, page_count, status,
         created_at, content_hash, source_role
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      destMaterialId,
      deckId,
      material.kind,
      destKey,
      material.filename,
      material.page_count,
      FILE_READY,
      createdAt,
      contentHash,
      material.source_role,
    )
    .run();

  if (material.kind === "pdf" || material.kind === "pptx") {
    try {
      const sidecar = await readAtlasOcrSidecar(
        c.env,
        material.atlas_id,
        material.id,
      );
      if (sidecar?.pages.length) {
        await writeOcrSidecar(
          c.env,
          deckId,
          destMaterialId,
          sidecar.pages,
          sidecar.unstudiedPages ?? [],
        );
      }
    } catch (err) {
      console.warn("atlas promote OCR sidecar copy failed", err);
    }
  }

  return c.json(
    {
      id: destMaterialId,
      deck_id: deckId,
      kind: material.kind,
      r2_key: destKey,
      filename: material.filename,
      page_count: material.page_count,
      status: FILE_READY,
      created_at: createdAt,
      source_role: material.source_role,
      jobId: null,
    },
    201,
  );
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
