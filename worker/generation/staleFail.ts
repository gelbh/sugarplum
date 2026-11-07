import { isRunningJobStale } from "./progress";
import { recordGenerationUsageEventForJob } from "./usage";

export const STALE_RUNNING_FAIL_ERROR =
  "Generation stalled and was stopped. Try generating again.";

export type RunningJobStaleRow = {
  id: string;
  progress_json: string | null;
  created_at: string;
};

/**
 * Fail one running job if its heartbeat is stale.
 * CAS matches reclaim: only succeeds if `progress_json` is still the snapshot
 * used for the stale check (reclaim that refreshed the heartbeat wins).
 */
export async function failRunningJobIfStale(
  db: D1Database,
  row: RunningJobStaleRow,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!isRunningJobStale(row.progress_json, row.created_at, nowMs)) {
    return false;
  }
  const finishedAt = new Date(nowMs).toISOString();
  const result =
    row.progress_json == null
      ? await db
          .prepare(
            `UPDATE generation_jobs
             SET status = ?, error = ?, finished_at = ?
             WHERE id = ? AND status = ? AND progress_json IS NULL`,
          )
          .bind(
            "failed",
            STALE_RUNNING_FAIL_ERROR,
            finishedAt,
            row.id,
            "running",
          )
          .run()
      : await db
          .prepare(
            `UPDATE generation_jobs
             SET status = ?, error = ?, finished_at = ?
             WHERE id = ? AND status = ? AND progress_json = ?`,
          )
          .bind(
            "failed",
            STALE_RUNNING_FAIL_ERROR,
            finishedAt,
            row.id,
            "running",
            row.progress_json,
          )
          .run();
  if ((result.meta.changes ?? 0) === 0) return false;
  await recordGenerationUsageEventForJob(db, row.id);
  return true;
}

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
        .all<RunningJobStaleRow>()
    : await db
        .prepare(
          `SELECT id, progress_json, created_at FROM generation_jobs
           WHERE status = 'running'
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .bind(limit)
        .all<RunningJobStaleRow>();

  let failed = 0;
  for (const row of rows.results ?? []) {
    if (await failRunningJobIfStale(db, row, nowMs)) failed += 1;
  }
  return failed;
}
