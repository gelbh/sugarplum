import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import type { Env } from "../env";
import { buildApkg } from "./buildApkg";
import { loadExportCards } from "./loadDeckCards";
import { resolveExportDeckIds } from "./resolveExportDecks";
import {
  EMPTY_EXPORT_WARNINGS,
  parseExportScopeJson,
  type ExportWarnings,
} from "./types";

export type RunExportJobResult =
  | { ok: true; warnings: ExportWarnings; r2Key: string }
  | { ok: false; error: string; warnings: ExportWarnings; httpStatus?: number };

type ExportRow = {
  id: string;
  user_id: string;
  status: string;
  request_json: string;
  r2_key: string | null;
};

/**
 * Build apkg for an existing export_jobs row and mark ready/failed.
 * Caller owns queued→running transition when async.
 */
export async function runExportJob(
  env: Env,
  exportId: string,
): Promise<RunExportJobResult> {
  const db = getDb(env);
  const row = await db
    .prepare(
      "SELECT id, user_id, status, request_json, r2_key FROM export_jobs WHERE id = ?",
    )
    .bind(exportId)
    .first<ExportRow>();
  if (!row) {
    return {
      ok: false,
      error: "Export not found",
      warnings: EMPTY_EXPORT_WARNINGS,
    };
  }

  const r2Key = row.r2_key ?? `exports/${row.user_id}/${row.id}.apkg`;

  try {
    const scope = parseExportScopeJson(row.request_json);
    const deckIds = await resolveExportDeckIds(env, row.user_id, scope);
    if (deckIds.length === 0) {
      const error = "No decks to export";
      await markFailed(db, row.id, row.user_id, error, EMPTY_EXPORT_WARNINGS);
      return { ok: false, error, warnings: EMPTY_EXPORT_WARNINGS, httpStatus: 400 };
    }

    const loaded = await loadExportCards(env, row.user_id, deckIds);
    if (loaded.entries.length === 0) {
      const error =
        loaded.warnings.skippedCards > 0
          ? `No exportable cards (${loaded.warnings.skippedCards} skipped)`
          : "No accepted cards to export";
      await markFailed(db, row.id, row.user_id, error, loaded.warnings);
      return {
        ok: false,
        error,
        warnings: loaded.warnings,
        httpStatus: 400,
      };
    }

    const bytes = await buildApkg({ entries: loaded.entries });
    await env.MATERIALS.put(r2Key, bytes);
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
        row.id,
        row.user_id,
      )
      .run();
    return { ok: true, warnings: loaded.warnings, r2Key };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    await db
      .prepare(
        "UPDATE export_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .bind(
        "failed",
        message,
        new Date().toISOString(),
        row.id,
        row.user_id,
      )
      .run();
    if (error instanceof HTTPException) {
      return {
        ok: false,
        error: message,
        warnings: EMPTY_EXPORT_WARNINGS,
        httpStatus: error.status,
      };
    }
    return { ok: false, error: message, warnings: EMPTY_EXPORT_WARNINGS };
  }
}

async function markFailed(
  db: D1Database,
  id: string,
  userId: string,
  error: string,
  warnings: ExportWarnings,
): Promise<void> {
  await db
    .prepare(
      "UPDATE export_jobs SET status = ?, error = ?, warning_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(
      "failed",
      error,
      JSON.stringify(warnings),
      new Date().toISOString(),
      id,
      userId,
    )
    .run();
}
