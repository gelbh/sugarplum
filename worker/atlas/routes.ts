import { Hono } from "hono";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import { refreshFocusBestEffort } from "./focus";
import type { AppEnv, AtlasRow } from "./types";
import { TEMPLATE_KEY, atlasMeta, newId, nowIso } from "./ownership";
import { atlasItemRoutes } from "./atlas-item-routes";
import {
  atlasMaterialItemRoutes,
  atlasPackRoutes,
} from "./atlas-material-routes";

export const atlasRoutes = new Hono<AppEnv>();

// view-as: allow
atlasRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const { results } = await db
    .prepare(
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE user_id = ? ORDER BY created_at ASC",
    )
    .bind(userId)
    .all<AtlasRow>();
  return c.json({ atlases: (results ?? []).map(atlasMeta) });
});

// view-as: deny
atlasRoutes.post("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);

  const existing = await db
    .prepare(
      "SELECT id, user_id, template_key, created_at FROM atlases WHERE user_id = ? AND template_key = ?",
    )
    .bind(userId, TEMPLATE_KEY)
    .first<AtlasRow>();
  if (existing) {
    return c.json(atlasMeta(existing));
  }

  const id = newId();
  const createdAt = nowIso();
  await db
    .prepare(
      "INSERT INTO atlases (id, user_id, template_key, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, userId, TEMPLATE_KEY, createdAt)
    .run();

  await refreshFocusBestEffort(db, c.env, { atlasId: id });

  return c.json(
    atlasMeta({
      id,
      user_id: userId,
      template_key: TEMPLATE_KEY,
      created_at: createdAt,
    }),
    201,
  );
});

atlasRoutes.route("/materials", atlasMaterialItemRoutes);
atlasRoutes.route("/:atlasId", atlasPackRoutes);
atlasRoutes.route("/:atlasId", atlasItemRoutes);
