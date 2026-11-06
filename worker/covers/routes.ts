import { Hono, type Context, type ExecutionContext } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  coverFieldsFromPhoto,
  resolveChosenPhoto,
  type CoverPhoto,
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
};

const LIST_COVERS_SQL =
  "SELECT owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url FROM shelf_covers WHERE user_id = ?";

const UPSERT_COVER_SQL =
  "INSERT INTO shelf_covers (user_id, owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, owner_kind, owner_id) DO UPDATE SET photo_id = excluded.photo_id, image_url = excluded.image_url, photographer_name = excluded.photographer_name, photographer_url = excluded.photographer_url, photo_html_url = excluded.photo_html_url";

const DELETE_COVER_SQL =
  "DELETE FROM shelf_covers WHERE user_id = ? AND owner_kind = ? AND owner_id = ?";

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
  return {
    ownerKind: row.owner_kind as StoredCoverRow["ownerKind"],
    ownerId: row.owner_id,
    photoId: row.photo_id,
    imageUrl: row.image_url,
    photographerName: row.photographer_name,
    photographerUrl: row.photographer_url,
    photoHtmlUrl: row.photo_html_url,
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
  return c.json({ photos: photos.map(coverFieldsFromPhoto) });
});

coverRoutes.put("/", async (c) => {
  const userId = await requireUser(c);
  const body = await readJson(c);
  const owner = readOwner(body);
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const photoId = typeof record.photoId === "string" ? record.photoId.trim() : "";
  if (!photoId) throw new HTTPException(400, { message: "Photo required" });

  const db = getDb(c.env);
  await requireOwnedTarget(db, userId, owner);

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

  const stored = coverFieldsFromPhoto(chosen);
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
    )
    .run();

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
  await db
    .prepare(DELETE_COVER_SQL)
    .bind(userId, owner.ownerKind, owner.ownerId)
    .run();
  return c.body(null, 204);
});
