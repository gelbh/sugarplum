import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import type { AppEnv, AtlasRow } from "./types";

export const TEMPLATE_KEY = "parasite";

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new HTTPException(400, { message: `${name} required` });
  return value;
}

export function atlasMeta(row: AtlasRow) {
  return {
    id: row.id,
    userId: row.user_id,
    templateKey: row.template_key,
    createdAt: row.created_at,
  };
}

export async function requireAtlas(
  db: D1Database,
  atlasId: string,
): Promise<AtlasRow> {
  const atlas = await db
    .prepare(
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE id = ?",
    )
    .bind(atlasId)
    .first<AtlasRow>();
  if (!atlas) throw new HTTPException(404, { message: "Atlas not found" });
  return atlas;
}

export async function requireOwnedAtlas(
  c: Parameters<typeof requireUser>[0],
  atlasId: string,
): Promise<{ userId: string; atlas: AtlasRow; db: D1Database }> {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const atlas = await requireAtlas(db, atlasId);
  if (atlas.user_id !== userId) {
    throw new HTTPException(404, { message: "Atlas not found" });
  }
  return { userId, atlas, db };
}
