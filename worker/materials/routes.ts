import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { enqueueGeneration } from "../generation/enqueue";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PASTE_BYTES,
} from "./limits";
import { figureR2Key } from "./figures";
import { createR2PutUrl } from "./r2-presign";

export { MAX_IMAGE_BYTES } from "./limits";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  created_at: string;
};

export type MaterialRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
};

/** Pastes ≤100KB use the same R2 path; schema has no body_text column for D1 inline. */
const PASTE_READY = "ready";
const FILE_UPLOADING = "uploading";
const FILE_READY = "ready";
const PDF_CONTENT_TYPE = "application/pdf";
const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const DEFAULT_R2_BUCKET = "sugarplum-materials";
const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

type UploadKind = "pdf" | "pptx" | "image";

function resolveUpload(
  contentType: string,
  filename: string,
): { kind: UploadKind; ext: string } | null {
  const lowerName = filename.toLowerCase();
  if (contentType === PDF_CONTENT_TYPE) return { kind: "pdf", ext: "pdf" };
  if (contentType === PPTX_CONTENT_TYPE) return { kind: "pptx", ext: "pptx" };
  if (
    ZIP_CONTENT_TYPES.has(contentType) &&
    lowerName.endsWith(".pptx")
  ) {
    return { kind: "pptx", ext: "pptx" };
  }
  if (IMAGE_CONTENT_TYPES.has(contentType)) {
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    return { kind: "image", ext };
  }
  return null;
}

function assertConfiguredR2AccountId(accountId: string): void {
  const trimmed = accountId.trim();
  if (
    !trimmed ||
    trimmed.startsWith("REPLACE_") ||
    trimmed.includes("REPLACE_WITH")
  ) {
    throw new HTTPException(500, {
      message: "R2_ACCOUNT_ID is not configured",
    });
  }
}

function newId(): string {
  return crypto.randomUUID();
}

/** Deck owned by userId, or 404 (do not leak existence to other users). */
export async function requireOwnedDeck(
  db: D1Database,
  deckId: string,
  userId: string,
): Promise<DeckRow> {
  const deck = await db
    .prepare(
      "SELECT id, user_id, title, subject_hint, created_at FROM decks WHERE id = ? AND user_id = ?",
    )
    .bind(deckId, userId)
    .first<DeckRow>();
  if (!deck) throw new HTTPException(404, { message: "Deck not found" });
  return deck;
}

async function requireOwnedMaterial(
  db: D1Database,
  materialId: string,
  userId: string,
): Promise<MaterialRow> {
  const row = await db
    .prepare(
      `SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count, m.status, m.created_at
       FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE m.id = ? AND d.user_id = ?`,
    )
    .bind(materialId, userId)
    .first<MaterialRow>();
  if (!row) throw new HTTPException(404, { message: "Material not found" });
  return row;
}

export const deckRoutes = new Hono<AppEnv>();

deckRoutes.post("/", async (c) => {
  const userId = await requireUser(c);
  let body: { title?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HTTPException(400, { message: "Title required" });

  const id = newId();
  const createdAt = new Date().toISOString();
  const db = getDb(c.env);

  await db
    .prepare(
      "INSERT INTO decks (id, user_id, title, subject_hint, created_at) VALUES (?, ?, ?, NULL, ?)",
    )
    .bind(id, userId, title, createdAt)
    .run();

  return c.json(
    {
      id,
      title,
      subject_hint: null,
      created_at: createdAt,
    },
    201,
  );
});

deckRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const { results } = await db
    .prepare(
      "SELECT id, title, subject_hint, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
    .bind(userId)
    .all<{
      id: string;
      title: string;
      subject_hint: string | null;
      created_at: string;
    }>();

  return c.json(results ?? []);
});

deckRoutes.post("/:id/materials/paste", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: { text?: unknown; filename?: unknown };
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

  const id = newId();
  const createdAt = new Date().toISOString();
  const r2Key = `materials/${deckId}/${id}.txt`;

  await c.env.MATERIALS.put(r2Key, text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, deckId, "paste", r2Key, filename, null, PASTE_READY, createdAt)
    .run();

  const jobId = await enqueueGeneration(c.env, {
    materialId: id,
    deckId,
  });

  const material: MaterialRow = {
    id,
    deck_id: deckId,
    kind: "paste",
    r2_key: r2Key,
    filename,
    page_count: null,
    status: PASTE_READY,
    created_at: createdAt,
  };

  return c.json({ ...material, jobId }, 201);
});

deckRoutes.post("/:id/materials/upload-url", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: { filename?: unknown; contentType?: unknown; size?: unknown };
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
  if (!resolved) {
    throw new HTTPException(400, {
      message:
        "Only PDF, PPTX, or image (jpeg/png/webp) uploads are allowed",
    });
  }

  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_FILE_BYTES) {
    throw new HTTPException(400, { message: "File must be 25MB or smaller" });
  }
  if (resolved.kind === "image" && size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Images for generation must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }

  const defaultName = `upload.${resolved.ext}`;
  const filename = filenameHint || defaultName;
  const putContentType =
    resolved.kind === "pptx" ? PPTX_CONTENT_TYPE : contentType;

  const materialId = newId();
  const createdAt = new Date().toISOString();
  const r2Key = `materials/${deckId}/${materialId}.${resolved.ext}`;

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
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      materialId,
      deckId,
      resolved.kind,
      r2Key,
      filename,
      null,
      FILE_UPLOADING,
      createdAt,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});

export const materialRoutes = new Hono<AppEnv>();

materialRoutes.post("/:id/figures/presign", async (c) => {
  const userId = await requireUser(c);
  const pdfMaterialId = c.req.param("id");
  const db = getDb(c.env);
  const parent = await requireOwnedMaterial(db, pdfMaterialId, userId);

  if (
    parent.kind !== "pdf" ||
    (parent.status !== FILE_UPLOADING && parent.status !== FILE_READY)
  ) {
    throw new HTTPException(400, {
      message: "Figure crops can only be attached to an uploading or ready PDF",
    });
  }

  let body: {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    index?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "figure.png";
  if (body.contentType !== "image/png") {
    throw new HTTPException(400, { message: "Figure crops must be PNG images" });
  }
  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Figure crops must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }
  const index = typeof body.index === "number" ? body.index : Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= 20) {
    throw new HTTPException(400, {
      message: "Figure crop index must be an integer from 0 to 19",
    });
  }

  const r2Key = figureR2Key(parent.deck_id, pdfMaterialId, index);
  const existingFigure = await db
    .prepare("SELECT id FROM materials WHERE r2_key = ?")
    .bind(r2Key)
    .first<{ id: string }>();
  if (existingFigure) {
    throw new HTTPException(409, {
      message: `Figure crop index ${index} is already attached to this PDF`,
    });
  }

  const materialId = newId();
  const createdAt = new Date().toISOString();
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
    contentType: "image/png",
    contentLength: size,
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      materialId,
      parent.deck_id,
      "image",
      r2Key,
      filename,
      null,
      FILE_UPLOADING,
      createdAt,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});

/** Session-gated media fetch by R2 key (must belong to a material the user owns). */
materialRoutes.get("/media", async (c) => {
  const userId = await requireUser(c);
  const key = c.req.query("key")?.trim();
  if (!key) {
    throw new HTTPException(400, { message: "key query required" });
  }
  const db = getDb(c.env);
  const owned = await db
    .prepare(
      `SELECT m.r2_key FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE m.r2_key = ? AND d.user_id = ?`,
    )
    .bind(key, userId)
    .first<{ r2_key: string }>();
  if (!owned) {
    throw new HTTPException(404, { message: "Media not found" });
  }
  const obj = await c.env.MATERIALS.get(key);
  if (!obj) {
    throw new HTTPException(404, { message: "Media not found" });
  }
  const lower = key.toLowerCase();
  const contentType =
    lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : "application/octet-stream";
  return new Response(obj.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    },
  });
});

materialRoutes.post("/:id/complete", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);

  if (material.status === FILE_READY) {
    return c.json({
      id: material.id,
      deck_id: material.deck_id,
      kind: material.kind,
      r2_key: material.r2_key,
      filename: material.filename,
      page_count: material.page_count,
      status: material.status,
      created_at: material.created_at,
      jobId: null,
    });
  }

  const cas = await db
    .prepare(
      "UPDATE materials SET status = ? WHERE id = ? AND status = ?",
    )
    .bind(FILE_READY, materialId, FILE_UPLOADING)
    .run();
  if (!cas.meta.changes) {
    throw new HTTPException(409, {
      message: "Material is not awaiting upload completion",
    });
  }

  const isFigure = material.r2_key?.includes("/figures/") ?? false;
  const jobId = isFigure
    ? null
    : await enqueueGeneration(c.env, {
        materialId,
        deckId: material.deck_id,
      });

  return c.json({
    id: material.id,
    deck_id: material.deck_id,
    kind: material.kind,
    r2_key: material.r2_key,
    filename: material.filename,
    page_count: material.page_count,
    status: FILE_READY,
    created_at: material.created_at,
    jobId,
  });
});
