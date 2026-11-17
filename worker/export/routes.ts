import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import type { Env } from "../env";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  applySandboxKeyPrefix,
  sandboxWriteUserId,
} from "../admin/sandbox-r2";
import { enqueueExport } from "./enqueue";
import { runExportJob } from "./runExportJob";
import { estimateExportWorkload, shouldEnqueueExport } from "./threshold";
import {
  CreateExportBodySchema,
  EMPTY_EXPORT_WARNINGS,
  parseExportWarningsJson,
} from "./types";
import { resolveExportDeckIds } from "./resolveExportDecks";

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
    error: row.error,
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

/** Lazy TTL: drop this user's expired export_jobs rows and R2 objects. */
export async function purgeExpiredExports(
  env: Env,
  userId: string,
): Promise<void> {
  const db = getDb(env);
  const now = new Date().toISOString();
  const { results } = await db
    .prepare(
      "SELECT id, r2_key FROM export_jobs WHERE user_id = ? AND expires_at <= ?",
    )
    .bind(userId, now)
    .all<{ id: string; r2_key: string | null }>();
  for (const row of results ?? []) {
    if (row.r2_key) {
      try {
        await env.MATERIALS.delete(row.r2_key);
      } catch {
        /* best-effort */
      }
    }
    await db
      .prepare("DELETE FROM export_jobs WHERE id = ? AND user_id = ?")
      .bind(row.id, userId)
      .run();
  }
}

async function insertJob(
  db: D1Database,
  args: {
    id: string;
    userId: string;
    status: "queued" | "running" | "failed";
    requestJson: string;
    r2Key: string;
    error?: string | null;
    createdAt: string;
    expiresAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO export_jobs
       (id, user_id, status, request_json, r2_key, error, warning_json,
        created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.id,
      args.userId,
      args.status,
      args.requestJson,
      args.r2Key,
      args.error ?? null,
      JSON.stringify(EMPTY_EXPORT_WARNINGS),
      args.createdAt,
      args.createdAt,
      args.expiresAt,
    )
    .run();
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

  await purgeExpiredExports(c.env, userId);

  const id = newId();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const db = getDb(c.env);
  const sandboxId = await sandboxWriteUserId(db, userId);
  const r2Key = applySandboxKeyPrefix(
    sandboxId,
    `exports/${userId}/${id}.apkg`,
  );
  const requestJson = JSON.stringify(parsed.data);

  const deckIds = await resolveExportDeckIds(c.env, userId, parsed.data);
  if (deckIds.length === 0) {
    const emptyMessage = "No decks to export";
    await insertJob(db, {
      id,
      userId,
      status: "failed",
      requestJson,
      r2Key,
      error: emptyMessage,
      createdAt,
      expiresAt,
    });
    return c.json(
      { message: emptyMessage, warnings: EMPTY_EXPORT_WARNINGS },
      400,
    );
  }

  const workload = await estimateExportWorkload(c.env, userId, deckIds);
  if (shouldEnqueueExport(workload)) {
    if (!c.env.EXPORT_QUEUE) {
      const message = "Export queue is not configured";
      await insertJob(db, {
        id,
        userId,
        status: "failed",
        requestJson,
        r2Key,
        error: message,
        createdAt,
        expiresAt,
      });
      throw new HTTPException(503, { message });
    }

    await insertJob(db, {
      id,
      userId,
      status: "queued",
      requestJson,
      r2Key,
      createdAt,
      expiresAt,
    });
    try {
      await enqueueExport(c.env, { exportId: id });
    } catch {
      const message = "Export queue is unavailable";
      await db
        .prepare(
          "UPDATE export_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .bind("failed", message, new Date().toISOString(), id, userId)
        .run();
      throw new HTTPException(503, { message });
    }
    return c.json(
      {
        id,
        status: "queued",
        warnings: EMPTY_EXPORT_WARNINGS,
        downloadPath: null,
      },
      202,
    );
  }

  await insertJob(db, {
    id,
    userId,
    status: "running",
    requestJson,
    r2Key,
    createdAt,
    expiresAt,
  });

  const result = await runExportJob(c.env, id);
  if (result.ok) {
    return c.json(
      {
        id,
        status: "ready",
        warnings: result.warnings,
        downloadPath: `/api/exports/${id}/download`,
      },
      201,
    );
  }

  if (result.kind === "business" || result.httpStatus === 400) {
    return c.json({ message: result.error, warnings: result.warnings }, 400);
  }
  if (result.kind === "not_found" || result.httpStatus === 404) {
    throw new HTTPException(404, { message: result.error });
  }
  throw new HTTPException(500, { message: "Export failed" });
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
