export const EXPORT_RUNNING_STALE_MS = 5 * 60 * 1000;

/** Must match wrangler sugarplum-export consumers.retry_delay. */
export const EXPORT_QUEUE_RETRY_DELAY_SEC = 30;

/** Must match wrangler sugarplum-export consumers.max_retries. */
export const EXPORT_QUEUE_MAX_RETRIES =
  Math.ceil(EXPORT_RUNNING_STALE_MS / 1000 / EXPORT_QUEUE_RETRY_DELAY_SEC) + 1;

export function isExportRunningStale(
  updatedAt: string,
  nowMs: number = Date.now(),
): boolean {
  const lastMs = Date.parse(updatedAt);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= EXPORT_RUNNING_STALE_MS;
}
