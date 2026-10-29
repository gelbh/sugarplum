import { getDb } from "../db/client";
import type { Env } from "../env";
import type { ExportQueueMessage } from "./enqueue";
import { runExportJob } from "./runExportJob";
import { EXPORT_QUEUE_RETRY_DELAY_SEC, isExportRunningStale } from "./stale";

type ExportClaimRow = {
  id: string;
  status: string;
  updated_at: string;
};

async function loadJob(
  db: D1Database,
  exportId: string,
): Promise<ExportClaimRow | null> {
  return db
    .prepare("SELECT id, status, updated_at FROM export_jobs WHERE id = ?")
    .bind(exportId)
    .first<ExportClaimRow>();
}

async function tryClaimExportJob(
  db: D1Database,
  exportId: string,
): Promise<"run" | "busy" | "done"> {
  const row = await loadJob(db, exportId);
  if (!row) return "done";
  if (row.status === "ready" || row.status === "failed") return "done";

  const nowIso = new Date().toISOString();

  if (row.status === "queued") {
    const claim = await db
      .prepare(
        "UPDATE export_jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
      )
      .bind("running", nowIso, exportId, "queued")
      .run();
    if (claim.meta.changes) return "run";

    const again = await loadJob(db, exportId);
    if (!again || again.status === "ready" || again.status === "failed") {
      return "done";
    }
    if (again.status === "running" && !isExportRunningStale(again.updated_at)) {
      return "busy";
    }
    if (again.status !== "running") return "done";
    return reclaimRunning(db, exportId, again.updated_at, nowIso);
  }

  if (row.status === "running") {
    if (!isExportRunningStale(row.updated_at)) return "busy";
    return reclaimRunning(db, exportId, row.updated_at, nowIso);
  }

  return "done";
}

async function reclaimRunning(
  db: D1Database,
  exportId: string,
  expectedUpdatedAt: string,
  nowIso: string,
): Promise<"run" | "busy" | "done"> {
  const reclaim = await db
    .prepare(
      "UPDATE export_jobs SET updated_at = ? WHERE id = ? AND status = ? AND updated_at = ?",
    )
    .bind(nowIso, exportId, "running", expectedUpdatedAt)
    .run();
  return reclaim.meta.changes ? "run" : "busy";
}

export async function handleExportQueue(
  batch: MessageBatch<ExportQueueMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const exportId = message.body?.exportId;
    if (typeof exportId !== "string" || exportId.length === 0) {
      message.ack();
      continue;
    }

    const db = getDb(env);
    const claim = await tryClaimExportJob(db, exportId);
    if (claim === "done") {
      message.ack();
      continue;
    }
    if (claim === "busy") {
      message.retry({ delaySeconds: EXPORT_QUEUE_RETRY_DELAY_SEC });
      continue;
    }

    const result = await runExportJob(env, exportId, {
      requeueOnTransient: true,
    });
    if (result.ok) {
      message.ack();
      continue;
    }

    if (result.kind === "business" || result.kind === "not_found") {
      message.ack();
      continue;
    }

    message.retry({ delaySeconds: EXPORT_QUEUE_RETRY_DELAY_SEC });
  }
}
