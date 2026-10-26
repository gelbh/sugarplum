import { useEffect, useRef, useState } from "react";
import { ApiError, getJob } from "../api/client";
import { useProgressRegistry } from "./ProgressProvider";
import type { ProgressSnapshot } from "./types";

const POLL_MS = 500;
const TIMEOUT_MS = 60_000;

const TERMINAL_OK = new Set(["needs_review", "done"]);
const TERMINAL_FAIL = new Set(["failed"]);

export type UseJobProgressResult = {
  /** Still polling a non-terminal job. */
  pending: boolean;
  /** Job reached needs_review or done. */
  ready: boolean;
  /** Failure message (job failed, timeout, or API error). */
  error: string | null;
  /** Latest snapshot upserted for this job (also in registry while active). */
  snapshot: ProgressSnapshot | null;
};

function snapshotFromJob(
  jobId: string,
  progress: {
    percent: number;
    label: string;
    current: number;
    total: number;
  } | null,
): ProgressSnapshot {
  if (!progress) {
    return {
      id: jobId,
      label: "Waiting for generation…",
      mode: "indeterminate",
      percent: 0,
      source: "job",
    };
  }
  const detail =
    progress.total > 0
      ? `chunk ${progress.current}/${progress.total}`
      : undefined;
  // No measurable units yet: keep label + weighted floor but stay indeterminate (honesty 1A).
  const measurable = progress.total > 0;
  return {
    id: jobId,
    label: progress.label || "Waiting for generation…",
    mode: measurable ? "determinate" : "indeterminate",
    percent: progress.percent,
    ...(detail ? { detail } : {}),
    source: "job",
  };
}

/**
 * Poll getJob ~every 500ms; upsert job-sourced progress into the registry.
 * Stops on needs_review|done|failed (or timeout); complete/fail accordingly.
 */
export function useJobProgress(jobId: string | null): UseJobProgressResult {
  const { upsert, complete, fail } = useProgressRegistry();
  const [pending, setPending] = useState(Boolean(jobId));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
    setReady(false);
    setError(null);
    setSnapshot(null);

    if (!jobId) {
      setPending(false);
      return;
    }

    setPending(true);
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + TIMEOUT_MS;

    const settleOk = () => {
      if (settledRef.current) return;
      settledRef.current = true;
      complete(jobId);
      setReady(true);
      setPending(false);
    };

    const settleFail = (message: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      fail(jobId);
      setError(message);
      setPending(false);
    };

    const tick = async () => {
      try {
        const job = await getJob(jobId);
        if (cancelled) return;

        const snap = snapshotFromJob(jobId, job.progress);
        setSnapshot(snap);
        if (!settledRef.current) upsert(snap);

        if (TERMINAL_OK.has(job.status)) {
          settleOk();
          return;
        }
        if (TERMINAL_FAIL.has(job.status)) {
          settleFail(job.error ?? "Generation failed");
          return;
        }
        if (Date.now() >= deadline) {
          settleFail("Timed out waiting for generation");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to poll job";
        settleFail(message);
        return;
      }

      if (!cancelled && !settledRef.current) {
        pollTimer = setTimeout(() => {
          void tick();
        }, POLL_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      if (!settledRef.current) {
        fail(jobId);
      }
    };
  }, [jobId, upsert, complete, fail]);

  return { pending, ready, error, snapshot };
}
