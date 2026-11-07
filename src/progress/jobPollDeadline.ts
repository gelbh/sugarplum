/** Match server `RUNNING_JOB_STALE_MS` — abandon when heartbeat is this old. */
export const JOB_POLL_RUNNING_TIMEOUT_MS = 20 * 60_000;

/**
 * Resolve the same heartbeat clock the server uses for `isRunningJobStale`:
 * prefer `updated_at`, else newest event `at`, else job `created_at`.
 */
export function resolveJobPollHeartbeatMs(args: {
  updatedAt?: string | null;
  events?: { at: string }[] | null;
  createdAt: string;
}): number | null {
  if (typeof args.updatedAt === "string") {
    const t = Date.parse(args.updatedAt);
    if (!Number.isNaN(t)) return t;
  }
  let newest: number | null = null;
  for (const ev of args.events ?? []) {
    const t = Date.parse(ev.at);
    if (Number.isNaN(t)) continue;
    if (newest == null || t > newest) newest = t;
  }
  if (newest != null) return newest;
  const created = Date.parse(args.createdAt);
  return Number.isNaN(created) ? null : created;
}

/**
 * Queued jobs never wall-clock time out.
 * Running jobs time out when the progress heartbeat is older than the stale window
 * (same rule as server `isRunningJobStale`).
 */
export function advanceJobPollDeadline(args: {
  status: string;
  heartbeatMs: number | null;
  nowMs: number;
  timeoutMs?: number;
}): { timedOut: boolean } {
  const timeoutMs = args.timeoutMs ?? JOB_POLL_RUNNING_TIMEOUT_MS;
  if (args.status === "queued" || args.status !== "running") {
    return { timedOut: false };
  }
  if (args.heartbeatMs == null) return { timedOut: false };
  return { timedOut: args.nowMs - args.heartbeatMs >= timeoutMs };
}
