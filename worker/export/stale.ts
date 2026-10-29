/** Queue redelivery may reclaim `running` export jobs older than this. */
export const EXPORT_RUNNING_STALE_MS = 5 * 60 * 1000;

/** Per-message delay when busy (must match wrangler consumers.retry_delay). */
export const EXPORT_QUEUE_RETRY_DELAY_SEC = 30;

/**
 * Consumer max_retries so busy retries can span EXPORT_RUNNING_STALE_MS
 * (must match wrangler consumers.max_retries for sugarplum-export).
 */
export const EXPORT_QUEUE_MAX_RETRIES =
  Math.ceil(EXPORT_RUNNING_STALE_MS / 1000 / EXPORT_QUEUE_RETRY_DELAY_SEC) + 1;

/** True when `updated_at` is at least EXPORT_RUNNING_STALE_MS old. */
export function isExportRunningStale(
  updatedAt: string,
  nowMs: number = Date.now(),
): boolean {
  const lastMs = Date.parse(updatedAt);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= EXPORT_RUNNING_STALE_MS;
}
