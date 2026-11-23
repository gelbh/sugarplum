import type { Env } from "../env";
import { getDb } from "../db/client";

/**
 * Flip a running job to needs_review after durable persist.
 * Idempotent: no-op when status is already past running.
 * Does not delete the extract sidecar — afterPersist still needs it for gap-fill.
 */
export async function softCompleteGenerationJob(
  env: Env,
  jobId: string,
  coverageJson: string | null = null,
): Promise<void> {
  const db = getDb(env);
  const finishedAt = new Date().toISOString();
  await db
    .prepare(
      "UPDATE generation_jobs SET status = ?, error = NULL, finished_at = ?, coverage_json = COALESCE(?, coverage_json) WHERE id = ? AND status = ?",
    )
    .bind("needs_review", finishedAt, coverageJson, jobId, "running")
    .run();
}
