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
  | {
      ok: false;
      kind: "business" | "not_found" | "transient";
      error: string;
      warnings: ExportWarnings;
      httpStatus?: number;
    };

type ExportRow = {
  id: string;
  user_id: string;
  status: string;
  request_json: string;
  r2_key: string | null;
};

export type RunExportJobOptions = {
  requeueOnTransient?: boolean;
};

export async function runExportJob(
  env: Env,
  exportId: string,
  opts?: RunExportJobOptions,
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
      kind: "not_found",
      error: "Export not found",
      warnings: EMPTY_EXPORT_WARNINGS,
      httpStatus: 404,
    };
  }

  const r2Key = row.r2_key ?? `exports/${row.user_id}/${row.id}.apkg`;

  try {
    const scope = parseExportScopeJson(row.request_json);
    const deckIds = await resolveExportDeckIds(env, row.user_id, scope);
    if (deckIds.length === 0) {
      const error = "No decks to export";
      await markFailed(db, row.id, row.user_id, error, EMPTY_EXPORT_WARNINGS);
      return {
        ok: false,
        kind: "business",
        error,
        warnings: EMPTY_EXPORT_WARNINGS,
        httpStatus: 400,
      };
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
        kind: "business",
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
    if (error instanceof HTTPException) {
      const kind = error.status === 404 ? "not_found" : "business";
      await markFailed(db, row.id, row.user_id, message, EMPTY_EXPORT_WARNINGS);
      return {
        ok: false,
        kind,
        error: message,
        warnings: EMPTY_EXPORT_WARNINGS,
        httpStatus: error.status,
      };
    }

    if (opts?.requeueOnTransient) {
      await db
        .prepare(
          "UPDATE export_jobs SET status = ?, error = NULL, updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .bind("queued", new Date().toISOString(), row.id, row.user_id)
        .run();
      return {
        ok: false,
        kind: "transient",
        error: message,
        warnings: EMPTY_EXPORT_WARNINGS,
      };
    }

    await markFailed(db, row.id, row.user_id, message, EMPTY_EXPORT_WARNINGS);
    return {
      ok: false,
      kind: "transient",
      error: message,
      warnings: EMPTY_EXPORT_WARNINGS,
    };
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
