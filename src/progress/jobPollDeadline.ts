/** Match server `RUNNING_JOB_STALE_MS` — client abandon budget while running. */
export const JOB_POLL_RUNNING_TIMEOUT_MS = 20 * 60_000;

/**
 * Advance the client poll deadline.
 * Queued jobs never wall-clock time out; the running budget starts on first
 * `running` observation.
 */
export function advanceJobPollDeadline(args: {
  status: string;
  runningDeadlineMs: number | null;
  nowMs: number;
  timeoutMs?: number;
}): { runningDeadlineMs: number | null; timedOut: boolean } {
  const timeoutMs = args.timeoutMs ?? JOB_POLL_RUNNING_TIMEOUT_MS;
  if (args.status === "queued") {
    return { runningDeadlineMs: null, timedOut: false };
  }
  if (args.status !== "running") {
    return { runningDeadlineMs: args.runningDeadlineMs, timedOut: false };
  }
  const runningDeadlineMs =
    args.runningDeadlineMs ?? args.nowMs + timeoutMs;
  return {
    runningDeadlineMs,
    timedOut: args.nowMs >= runningDeadlineMs,
  };
}
