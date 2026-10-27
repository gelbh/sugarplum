import { useEffect, useRef, useState } from "react";
import { ApiError, getJob } from "../api/client";
import { useProgressRegistry } from "./ProgressProvider";
import type { ProgressSnapshot } from "./types";
import {
  etaMs,
  projectTokens,
  projectCardsThisJob,
  remainingCardsToday,
} from "./estimates";

const POLL_MS = 500;
const TIMEOUT_MS = 10 * 60_000;

const TERMINAL_OK = new Set(["needs_review", "done"]);
const TERMINAL_FAIL = new Set(["failed"]);

export type Estimates = {
  etaMs: number | null;
  projectedTokens: number | null;
  projectedCards: number | null;
  remainingCardsToday: number | null;
};

export type UseJobProgressResult = {
  pending: boolean;
  ready: boolean;
  error: string | null;
  snapshot: ProgressSnapshot | null;
  freeQuota: { used: number; cap: number; remaining: number } | null;
  estimates: Estimates | null;
};

export function useJobProgress(jobId: string | null): UseJobProgressResult {
  const { upsert, complete, fail } = useProgressRegistry();
  const [pending, setPending] = useState(Boolean(jobId));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [freeQuota, setFreeQuota] = useState<{
    used: number;
    cap: number;
    remaining: number;
  } | null>(null);
  const [estimates, setEstimates] = useState<Estimates | null>(null);
  const settledRef = useRef(false);
  const startedAtRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    settledRef.current = false;
    setReady(false);
    setError(null);
    setSnapshot(null);
    setFreeQuota(null);
    setEstimates(null);
    startedAtRef.current = undefined;

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

    const snapshotFromJob = (
      jobId: string,
      progress: any | null,
    ): ProgressSnapshot => {
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
      const measurable = progress.total > 0;
      return {
        id: jobId,
        label: progress.label || "Waiting for generation…",
        mode: measurable ? "determinate" : "indeterminate",
        percent: progress.percent,
        ...(detail ? { detail } : {}),
        source: "job",
      };
    };

    const tick = async () => {
      try {
        const job = await getJob(jobId);
        if (cancelled) return;

        const snapBase = snapshotFromJob(jobId, job.progress);
        if (job.progress && startedAtRef.current === undefined) {
          startedAtRef.current = Date.now();
        }
        const ext: any = { ...snapBase };
        if (startedAtRef.current) ext.startedAt = startedAtRef.current;
        if (job.progress) {
          ext.tokensUsed = job.progress.tokens_used;
          ext.tokensPrompt = job.progress.tokens_prompt;
          ext.tokensCompletion = job.progress.tokens_completion;
          ext.current = job.progress.current;
          ext.total = job.progress.total;
          ext.draftsSoFar = job.progress.drafts_so_far;
          ext.path = job.progress.path ?? null;
          ext.freeQuota = job.free_quota ?? null;
          ext.stage = job.progress.stage;

          if (job.progress.events) {
            ext.events = job.progress.events.map((e: any) => ({
              at: Date.parse(e.at),
              kind: e.kind,
              stage: e.stage,
              text: e.text,
            }));
          } else {
            ext.events = [];
          }

          // derive ordered unique presentStages from events (chronological) and current stage
          const seen = new Set<string>();
          const ordered: string[] = [];
          for (const ev of ext.events || []) {
            if (ev.stage && !seen.has(ev.stage)) {
              seen.add(ev.stage);
              ordered.push(ev.stage);
            }
          }
          if (ext.stage && !seen.has(ext.stage)) {
            ordered.push(ext.stage);
            seen.add(ext.stage);
          }
          ext.presentStages = ordered;
        }

        setFreeQuota(job.free_quota ?? null);
        if (!settledRef.current) upsert(ext);

        let eta: number | null = null;
        let projectedTokens: number | null = null;
        let projectedCards: number | null = null;
        let remainingCards: number | null = null;
        if (ext.startedAt && job.progress) {
          const elapsed = Date.now() - ext.startedAt;
          eta = etaMs(elapsed, job.progress.percent);
          if (typeof job.progress.tokens_used === "number") {
            projectedTokens = projectTokens(
              job.progress.tokens_used,
              job.progress.current,
              job.progress.total,
            );
          }
          if (
            typeof job.progress.drafts_so_far === "number" &&
            job.progress.drafts_so_far > 0
          ) {
            projectedCards = projectCardsThisJob(
              job.progress.drafts_so_far,
              job.progress.current,
              job.progress.total,
            );
            remainingCards = remainingCardsToday({
              draftsSoFar: job.progress.drafts_so_far,
              current: job.progress.current,
              total: job.progress.total,
              freeRemaining: job.free_quota?.remaining ?? 0,
              priorCardsPerJob: null,
            });
          }
        }
        setEstimates({
          etaMs: eta,
          projectedTokens,
          projectedCards,
          remainingCardsToday: remainingCards,
        });

        // attach estimates onto snapshot so consumers like JobProgressPanel can prefer hook-provided values
        const snapshotWithEstimates: ProgressSnapshot = {
          ...ext,
          etaMs: eta,
          projectedTokens,
          projectedCards,
          remainingCardsToday: remainingCards,
        };

        setSnapshot(snapshotWithEstimates);

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

  return { pending, ready, error, snapshot, freeQuota, estimates };
}
