import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import type { Env } from "../env";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  CreateExportBodySchema,
  EMPTY_EXPORT_WARNINGS,
  parseExportWarningsJson,
} from "./types";
import { buildApkg } from "./buildApkg";
import { loadDeckCards } from "./loadDeckCards";

type AppEnv = { Bindings: Env; Variables: AuthVariables };
type ExportRow = {
  id: string;
  user_id: string;
  status: string;
  request_json: string;
  r2_key: string | null;
  error: string | null;
  warning_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export const exportRoutes = new Hono<AppEnv>();

function newId(): string {
  return crypto.randomUUID();
}

function responseForJob(row: ExportRow) {
  const warnings =
    parseExportWarningsJson(row.warning_json) ?? EMPTY_EXPORT_WARNINGS;
  return {
    id: row.id,
    status: row.status,
    warnings,
    downloadPath:
      row.status === "ready" ? `/api/exports/${row.id}/download` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

async function ownedJob(
  db: D1Database,
  id: string,
  userId: string,
): Promise<ExportRow> {
  const row = await db
    .prepare(
      "SELECT id, user_id, status, request_json, r2_key, error, warning_json, created_at, updated_at, expires_at FROM export_jobs WHERE id = ? AND user_id = ?",
    )
    .bind(id, userId)
    .first<ExportRow>();
  if (!row) throw new HTTPException(404, { message: "Export not found" });
  return row;
}

exportRoutes.post("/", async (c) => {
  const userId = await requireUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const parsed = CreateExportBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid export body",
    });
  }

  const id = newId();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const r2Key = `exports/${userId}/${id}.apkg`;
  const db = getDb(c.env);
  await db
    .prepare(
      `INSERT INTO export_jobs
       (id, user_id, status, request_json, r2_key, error, warning_json,
        created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      "running",
      JSON.stringify(parsed.data),
      r2Key,
      JSON.stringify(EMPTY_EXPORT_WARNINGS),
      createdAt,
      createdAt,
      expiresAt,
    )
    .run();

  let loaded;
  try {
    loaded = await loadDeckCards(c.env, userId, parsed.data.deckId);
    if (loaded.entries.length === 0) {
      const emptyMessage =
        loaded.warnings.skippedCards > 0
          ? `No exportable cards (${loaded.warnings.skippedCards} skipped)`
          : "No accepted cards to export";
      await db
        .prepare(
          "UPDATE export_jobs SET status = ?, error = ?, warning_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .bind(
          "failed",
          emptyMessage,
          JSON.stringify(loaded.warnings),
          new Date().toISOString(),
          id,
          userId,
        )
        .run();
      return c.json({ message: emptyMessage, warnings: loaded.warnings }, 400);
    }
    const bytes = await buildApkg({
      deckName: loaded.deckName,
      entries: loaded.entries,
    });
    await c.env.MATERIALS.put(r2Key, bytes);
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE export_jobs SET status = ?, r2_key = ?, warning_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .bind(
        "ready",
        r2Key,
        JSON.stringify(loaded.warnings),
        updatedAt,
        id,
        userId,
      )
      .run();
    return c.json(
      {
        id,
        status: "ready",
        warnings: loaded.warnings,
        downloadPath: `/api/exports/${id}/download`,
      },
      201,
    );
  } catch (error) {
    await db
      .prepare(
        "UPDATE export_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .bind(
        "failed",
        error instanceof Error ? error.message : "Export failed",
        new Date().toISOString(),
        id,
        userId,
      )
      .run();
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: "Export failed" });
  }
});

exportRoutes.get("/:id/download", async (c) => {
  const userId = await requireUser(c);
  const row = await ownedJob(getDb(c.env), c.req.param("id"), userId);
  if (row.status !== "ready" || !row.r2_key) {
    throw new HTTPException(409, { message: "Export is not ready" });
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    throw new HTTPException(410, { message: "Export has expired" });
  }
  const object = await c.env.MATERIALS.get(row.r2_key);
  if (!object) throw new HTTPException(404, { message: "Export not found" });
  return new Response(object.body, {
    headers: {
      "content-type": "application/vnd.anki.package",
      "content-disposition": `attachment; filename="${row.id}.apkg"`,
    },
  });
});

exportRoutes.get("/:id", async (c) => {
  const userId = await requireUser(c);
  const row = await ownedJob(getDb(c.env), c.req.param("id"), userId);
  return c.json(responseForJob(row));
});
