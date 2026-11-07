import { isRunningJobStale } from "./progress";
import { recordGenerationUsageEventForJob } from "./usage";

export const STALE_RUNNING_FAIL_ERROR =
  "Generation stalled and was stopped. Try generating again.";

type RunningRow = {
  id: string;
  progress_json: string | null;
  created_at: string;
};

/**
 * Mark abandoned `running` jobs failed when their progress heartbeat is stale.
 * Does not reclaim or requeue; reclaim stays on queue redelivery in the consumer.
 */
export async function failStaleRunningJobs(
  db: D1Database,
  opts?: { jobId?: string; nowMs?: number; limit?: number },
): Promise<number> {
  const nowMs = opts?.nowMs ?? Date.now();
  const limit = opts?.limit ?? 50;
  const rows = opts?.jobId
    ? await db
        .prepare(
          `SELECT id, progress_json, created_at FROM generation_jobs
           WHERE id = ? AND status = 'running'`,
        )
        .bind(opts.jobId)
        .all<RunningRow>()
    : await db
        .prepare(
          `SELECT id, progress_json, created_at FROM generation_jobs
           WHERE status = 'running'
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .bind(limit)
        .all<RunningRow>();

  let failed = 0;
  for (const row of rows.results ?? []) {
    if (!isRunningJobStale(row.progress_json, row.created_at, nowMs)) {
      continue;
    }
    const finishedAt = new Date(nowMs).toISOString();
    const result = await db
      .prepare(
        `UPDATE generation_jobs
         SET status = ?, error = ?, finished_at = ?
         WHERE id = ? AND status = ?`,
      )
      .bind("failed", STALE_RUNNING_FAIL_ERROR, finishedAt, row.id, "running")
      .run();
    if ((result.meta.changes ?? 0) > 0) {
      await recordGenerationUsageEventForJob(db, row.id);
      failed += 1;
    }
  }
  return failed;
}
