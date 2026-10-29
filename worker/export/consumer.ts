import { getDb } from "../db/client";
import type { Env } from "../env";
import type { ExportQueueMessage } from "./enqueue";
import { runExportJob } from "./runExportJob";

/** Cloudflare Queues consumer entry for sugarplum-export. */
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
    const row = await db
      .prepare(
        "SELECT id, status FROM export_jobs WHERE id = ?",
      )
      .bind(exportId)
      .first<{ id: string; status: string }>();

    if (!row || row.status !== "queued") {
      message.ack();
      continue;
    }

    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE export_jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
      )
      .bind("running", updatedAt, exportId, "queued")
      .run();

    const result = await runExportJob(env, exportId);
    if (result.ok) {
      message.ack();
      continue;
    }

    // Business failures (empty decks/cards, 404) already marked failed — ack.
    if (result.httpStatus === 400 || result.httpStatus === 404) {
      message.ack();
      continue;
    }

    // Transient / unexpected: retry via queue.
    message.retry();
  }
}
