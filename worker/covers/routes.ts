import { Hono, type Context, type ExecutionContext } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { MAX_IMAGE_BYTES } from "../materials/limits";
import { createR2PutUrl } from "../materials/r2-presign";
import {
  coverFieldsFromPhoto,
  resolveChosenPhoto,
  type CoverPhoto,
  type CoverSource,
  type StoredCover,
} from "./rank";
import { fetchCoverPhoto, searchCoverPhotos, trackDownload } from "./unsplash";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type StoredCoverRow = StoredCover & {
  ownerKind: "subject" | "deck";
  ownerId: string;
};

type OwnerRef = { ownerKind: "subject" | "deck"; ownerId: string };

type ShelfSqlRow = {
  owner_kind: string;
  owner_id: string;
  photo_id: string;
  image_url: string;
  photographer_name: string;
  photographer_url: string;
  photo_html_url: string;
  source: string;
  r2_key: string | null;
};

const DEFAULT_R2_BUCKET = "sugarplum-materials";

const LIST_COVERS_SQL =
  "SELECT owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url, source, r2_key FROM shelf_covers WHERE user_id = ?";

const UPSERT_COVER_SQL =
  "INSERT INTO shelf_covers (user_id, owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url, source, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, owner_kind, owner_id) DO UPDATE SET photo_id = excluded.photo_id, image_url = excluded.image_url, photographer_name = excluded.photographer_name, photographer_url = excluded.photographer_url, photo_html_url = excluded.photo_html_url, source = excluded.source, r2_key = excluded.r2_key";

const SELECT_COVER_R2_SQL =
  "SELECT r2_key FROM shelf_covers WHERE user_id = ? AND owner_kind = ? AND owner_id = ?";

const SELECT_OWNED_R2_SQL =
  "SELECT r2_key FROM shelf_covers WHERE user_id = ? AND r2_key = ?";

const DELETE_COVER_SQL =
  "DELETE FROM shelf_covers WHERE user_id = ? AND owner_kind = ? AND owner_id = ?";

function newId(): string {
  return crypto.randomUUID();
}

function readExecutionCtx(c: Context<AppEnv>): ExecutionContext | undefined {
  // Hono throws when a request has no execution context (Vitest app.request).
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

function unsplashKey(env: Env): string | null {
  const key = env.UNSPLASH_ACCESS_KEY?.trim() ?? "";
  return key || null;
}

function coverSearchNotConfigured(c: Context<AppEnv>): Response {
  return c.json({ error: "Cover search is not configured" }, 503);
}

function coverMediaPath(r2Key: string): string {
  return `/api/covers/media?key=${encodeURIComponent(r2Key)}`;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
}

function readOwner(body: unknown): OwnerRef {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const ownerKind = record.ownerKind;
  const ownerId = typeof record.ownerId === "string" ? record.ownerId.trim() : "";
  if ((ownerKind !== "subject" && ownerKind !== "deck") || !ownerId) {
    throw new HTTPException(400, { message: "Invalid owner" });
  }
  return { ownerKind, ownerId };
}

function toStoredCoverRow(row: ShelfSqlRow): StoredCoverRow {
  const source: CoverSource = row.source === "custom" ? "custom" : "unsplash";
  return {
    ownerKind: row.owner_kind as StoredCoverRow["ownerKind"],
    ownerId: row.owner_id,
    photoId: row.photo_id,
    imageUrl: row.image_url,
    photographerName: row.photographer_name,
    photographerUrl: row.photographer_url,
    photoHtmlUrl: row.photo_html_url,
    source,
    r2Key: row.r2_key,
  };
}

async function requireOwnedTarget(
  db: D1Database,
  userId: string,
  owner: OwnerRef,
): Promise<void> {
  if (owner.ownerKind === "subject") {
    const row = await db
      .prepare(
        "SELECT id, user_id, title, created_at FROM subjects WHERE id = ? AND user_id = ?",
      )
      .bind(owner.ownerId, userId)
      .first();
    if (!row) throw new HTTPException(404, { message: "Subject not found" });
    return;
  }
  const row = await db
    .prepare(
      "SELECT id, user_id, title, subject_hint, created_at FROM decks WHERE id = ? AND user_id = ?",
    )
    .bind(owner.ownerId, userId)
    .first();
  if (!row) throw new HTTPException(404, { message: "Deck not found" });
}

async function readPriorR2Key(
  db: D1Database,
  userId: string,
  owner: OwnerRef,
): Promise<string | null> {
  const prev = await db
    .prepare(SELECT_COVER_R2_SQL)
    .bind(userId, owner.ownerKind, owner.ownerId)
    .first<{ r2_key: string | null }>();
  const key = prev?.r2_key?.trim();
  return key || null;
}

async function deleteR2Key(env: Env, key: string | null): Promise<void> {
  if (!key) return;
  try {
    await env.MATERIALS.delete(key);
  } catch {}
}

async function upsertCoverRow(
  db: D1Database,
  userId: string,
  owner: OwnerRef,
  stored: StoredCover,
): Promise<void> {
  await db
    .prepare(UPSERT_COVER_SQL)
    .bind(
      userId,
      owner.ownerKind,
      owner.ownerId,
      stored.photoId,
      stored.imageUrl,
      stored.photographerName,
      stored.photographerUrl,
      stored.photoHtmlUrl,
      stored.source,
      stored.r2Key ?? null,
    )
    .run();
}

function contentTypeExt(contentType: string): "jpg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function mediaContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export const coverRoutes = new Hono<AppEnv>();

coverRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const { results } = await db
    .prepare(LIST_COVERS_SQL)
    .bind(userId)
    .all<ShelfSqlRow>();
  return c.json({ covers: (results ?? []).map(toStoredCoverRow) });
});

coverRoutes.get("/search", async (c) => {
  await requireUser(c);
  const accessKey = unsplashKey(c.env);
  if (!accessKey) return coverSearchNotConfigured(c);
  const q = (c.req.query("q") ?? "").trim();
  if (!q) throw new HTTPException(400, { message: "Title required" });
  const photos = await searchCoverPhotos(accessKey, q, globalThis.fetch);
  return c.json({
    photos: photos.map((photo) => coverFieldsFromPhoto(photo, "unsplash")),
  });
});

coverRoutes.get("/media", async (c) => {
  const userId = await requireUser(c);
  const key = c.req.query("key")?.trim();
  if (!key) throw new HTTPException(400, { message: "key query required" });
  const db = getDb(c.env);
  const owned = await db
    .prepare(SELECT_OWNED_R2_SQL)
    .bind(userId, key)
    .first<{ r2_key: string }>();
  if (!owned) throw new HTTPException(404, { message: "Media not found" });
  const obj = await c.env.MATERIALS.get(key);
  if (!obj) throw new HTTPException(404, { message: "Media not found" });
  return new Response(obj.body, {
    headers: {
      "content-type": mediaContentType(key),
      "cache-control": "private, max-age=3600",
    },
  });
});

coverRoutes.post("/upload-url", async (c) => {
  const userId = await requireUser(c);
  const body = await readJson(c);
  const owner = readOwner(body);
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const contentType =
    typeof record.contentType === "string" ? record.contentType.trim() : "";
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(contentType)) {
    throw new HTTPException(400, {
      message: "Only jpeg/png/webp uploads are allowed",
    });
  }
  const size =
    typeof record.size === "number" ? record.size : Number(record.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Image must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }

  const db = getDb(c.env);
  await requireOwnedTarget(db, userId, owner);

  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }

  const imageId = newId();
  const ext = contentTypeExt(contentType);
  const r2Key = `covers/${userId}/${owner.ownerKind}/${owner.ownerId}/${imageId}.${ext}`;
  const uploadUrl = await createR2PutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    contentType,
    contentLength: size,
  });

  return c.json({ imageId, uploadUrl, r2Key });
});

coverRoutes.put("/", async (c) => {
  const userId = await requireUser(c);
  const body = await readJson(c);
  const owner = readOwner(body);
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const db = getDb(c.env);
  await requireOwnedTarget(db, userId, owner);

  if (record.source === "custom") {
    const r2Key = typeof record.r2Key === "string" ? record.r2Key.trim() : "";
    const prefix = `covers/${userId}/${owner.ownerKind}/${owner.ownerId}/`;
    if (!r2Key || !r2Key.startsWith(prefix)) {
      throw new HTTPException(400, { message: "Invalid cover key" });
    }
    const head = await c.env.MATERIALS.head(r2Key);
    if (!head) throw new HTTPException(400, { message: "Upload missing" });

    const priorKey = await readPriorR2Key(db, userId, owner);
    const photoId =
      typeof record.photoId === "string" && record.photoId.trim()
        ? record.photoId.trim()
        : newId();
    const stored: StoredCover = {
      photoId,
      imageUrl: coverMediaPath(r2Key),
      photographerName: "",
      photographerUrl: "",
      photoHtmlUrl: "",
      source: "custom",
      r2Key,
    };
    await upsertCoverRow(db, userId, owner, stored);
    if (priorKey && priorKey !== r2Key) {
      await deleteR2Key(c.env, priorKey);
    }
    return c.json({
      ...stored,
      ownerKind: owner.ownerKind,
      ownerId: owner.ownerId,
    } satisfies StoredCoverRow);
  }

  const photoId = typeof record.photoId === "string" ? record.photoId.trim() : "";
  if (!photoId) throw new HTTPException(400, { message: "Photo required" });

  const accessKey = unsplashKey(c.env);
  if (!accessKey) return coverSearchNotConfigured(c);

  const mapped = await fetchCoverPhoto(accessKey, photoId, globalThis.fetch);
  let chosen: CoverPhoto;
  try {
    chosen = resolveChosenPhoto(photoId, mapped ? [mapped] : []);
  } catch (err) {
    if (err instanceof Error && err.message === "unknown photo") {
      throw new HTTPException(404, { message: "unknown photo" });
    }
    throw err;
  }

  const priorKey = await readPriorR2Key(db, userId, owner);
  const stored = coverFieldsFromPhoto(chosen, "unsplash");
  await upsertCoverRow(db, userId, owner, stored);
  await deleteR2Key(c.env, priorKey);

  if (chosen.downloadLocation) {
    const ping = trackDownload(accessKey, chosen.downloadLocation, globalThis.fetch);
    const executionCtx = readExecutionCtx(c);
    if (executionCtx) executionCtx.waitUntil(ping);
    else void ping;
  }

  const row: StoredCoverRow = {
    ...stored,
    ownerKind: owner.ownerKind,
    ownerId: owner.ownerId,
  };
  return c.json(row);
});

coverRoutes.delete("/", async (c) => {
  const userId = await requireUser(c);
  const owner = readOwner(await readJson(c));
  const db = getDb(c.env);
  const priorKey = await readPriorR2Key(db, userId, owner);
  await db
    .prepare(DELETE_COVER_SQL)
    .bind(userId, owner.ownerKind, owner.ownerId)
    .run();
  await deleteR2Key(c.env, priorKey);
  return c.body(null, 204);
});
