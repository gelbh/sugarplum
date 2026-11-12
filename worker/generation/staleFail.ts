import type { Env } from "../env";
import { getDb } from "../db/client";
import { afterRunningJobTerminal } from "./jobTerminal";
import { isRunningJobStale } from "./progress";

export const STALE_RUNNING_FAIL_ERROR =
  "Generation stalled and was stopped. Try generating again.";

export type RunningJobStaleRow = {
  id: string;
  progress_json: string | null;
  created_at: string;
};

export function softCompleteCoverageJson(draftCount: number): string {
  return JSON.stringify({
    covered: [],
    gaps: [],
    draft_count: draftCount,
  });
}

async function countJobCards(db: D1Database, jobId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM cards WHERE job_id = ?")
    .bind(jobId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Soft-complete: set coverage ledger. Fail path must not touch coverage_json. */
async function casSoftComplete(
  db: D1Database,
  row: RunningJobStaleRow,
  coverageJson: string,
  finishedAt: string,
): Promise<boolean> {
  const result =
    row.progress_json == null
      ? await db
          .prepare(
            `UPDATE generation_jobs
             SET status = ?, error = NULL, coverage_json = ?, finished_at = ?
             WHERE id = ? AND status = ? AND progress_json IS NULL`,
          )
          .bind(
            "needs_review",
            coverageJson,
            finishedAt,
            row.id,
            "running",
          )
          .run()
      : await db
          .prepare(
            `UPDATE generation_jobs
             SET status = ?, error = NULL, coverage_json = ?, finished_at = ?
             WHERE id = ? AND status = ? AND progress_json = ?`,
          )
          .bind(
            "needs_review",
            coverageJson,
            finishedAt,
            row.id,
            "running",
            row.progress_json,
          )
          .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Fail: leave coverage_json unchanged (may hold window_resume). */
async function casFail(
  db: D1Database,
  row: RunningJobStaleRow,
  finishedAt: string,
): Promise<boolean> {
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
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Fail or soft-complete one running job if its heartbeat is stale.
 * Soft-complete (`needs_review`) when draft/persisted cards already exist.
 * CAS matches reclaim: only succeeds if `progress_json` is still the snapshot
 * used for the stale check (reclaim that refreshed the heartbeat wins).
 * Deletes the R2 extract sidecar after a successful terminal transition.
 */
export async function failRunningJobIfStale(
  env: Env,
  row: RunningJobStaleRow,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!isRunningJobStale(row.progress_json, row.created_at, nowMs)) {
    return false;
  }
  const db = getDb(env);
  const finishedAt = new Date(nowMs).toISOString();
  const cardCount = await countJobCards(db, row.id);
  const ok =
    cardCount > 0
      ? await casSoftComplete(
          db,
          row,
          softCompleteCoverageJson(cardCount),
          finishedAt,
        )
      : await casFail(db, row, finishedAt);
  if (!ok) return false;
  await afterRunningJobTerminal(env, row.id);
  return true;
}

/**
 * Mark abandoned `running` jobs terminal when their progress heartbeat is stale.
 * Soft-completes when cards exist; otherwise fails.
 * Does not reclaim or requeue; reclaim stays on queue redelivery in the consumer.
 */
export async function failStaleRunningJobs(
  env: Env,
  opts?: { jobId?: string; nowMs?: number; limit?: number },
): Promise<number> {
  const db = getDb(env);
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
    if (await failRunningJobIfStale(env, row, nowMs)) failed += 1;
  }
  return failed;
}
