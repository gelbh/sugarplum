import { useEffect, useRef, useState } from "react";
import { ApiError, getJob } from "../api/client";
import { useProgressRegistry } from "./ProgressProvider";
import type { ProgressSnapshot } from "./types";
import {
  calmDisplayEtaMs,
  combineEtaMs,
  updateEwmaRate,
  type CalmEtaSample,
  type EwmaRateState,
  resolveJobStartedAtMs,
  projectTokensFromPercent,
  projectCardsFromPercent,
} from "./estimates";
import { PROGRESS_STAGE_ORDER } from "./copy";
import { buildJobProgressSnapshot } from "./jobSnapshot";
import {
  JOB_POLL_RUNNING_TIMEOUT_MS,
  advanceJobPollDeadline,
  resolveJobPollHeartbeatMs,
} from "./jobPollDeadline";

const POLL_MS = 500;

const TERMINAL_OK = new Set(["needs_review", "done"]);
const TERMINAL_FAIL = new Set(["failed"]);

export type Estimates = {
  etaMs: number | null;
  projectedTokens: number | null;
  projectedCards: number | null;
};

export type UseJobProgressResult = {
  pending: boolean;
  ready: boolean;
  error: string | null;
  snapshot: ProgressSnapshot | null;
  freeQuota: { used: number; cap: number; remaining: number } | null;
  estimates: Estimates | null;
};

const POLL_FETCH_TIMEOUT_MS = 8_000;
const ETA_TICK_MS = 1_000;

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
  const calmEtaRef = useRef<CalmEtaSample | null>(null);
  const calmStartedAtRef = useRef<number | null>(null);
  const ewmaRef = useRef<EwmaRateState | null>(null);

  useEffect(() => {
    settledRef.current = false;
    setReady(false);
    setError(null);
    setSnapshot(null);
    setFreeQuota(null);
    setEstimates(null);
    calmEtaRef.current = null;
    calmStartedAtRef.current = null;
    ewmaRef.current = null;

    if (!jobId) {
      setPending(false);
      return;
    }

    setPending(true);
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let etaTickTimer: ReturnType<typeof setInterval> | undefined;

    const applyEtaCountdown = (nowMs: number) => {
      const sample = calmEtaRef.current;
      if (!sample || settledRef.current) return;
      const wallDelta = Math.max(0, nowMs - sample.atMs);
      const display = Math.max(0, sample.displayEtaMs - wallDelta);
      const nextEta = display === 0 ? null : display;
      setSnapshot((prev) => {
        if (!prev || prev.etaMs === nextEta) return prev;
        return { ...prev, etaMs: nextEta };
      });
      setEstimates((prev) => {
        if (!prev || prev.etaMs === nextEta) return prev;
        return { ...prev, etaMs: nextEta };
      });
    };

    // Keep ETA counting down even when getJob polls stall (e.g. Docling blocks).
    etaTickTimer = setInterval(() => {
      if (cancelled) return;
      applyEtaCountdown(Date.now());
    }, ETA_TICK_MS);

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
        const job = await getJob(jobId, {
          signal: AbortSignal.timeout(POLL_FETCH_TIMEOUT_MS),
        });
        if (cancelled) return;

        const snapBase = buildJobProgressSnapshot(
          jobId,
          job.status,
          job.progress,
        );

        // Queued: builder owns the snapshot; no progress enrichment / ETA.
        if (job.status === "queued") {
          calmEtaRef.current = null;
          calmStartedAtRef.current = null;
          ewmaRef.current = null;
          setFreeQuota(job.free_quota ?? null);
          setEstimates({
            etaMs: null,
            projectedTokens: null,
            projectedCards: null,
          });
          if (!settledRef.current) upsert(snapBase);
          setSnapshot({
            ...snapBase,
            etaMs: null,
            projectedTokens: null,
            projectedCards: null,
          });
        } else {
          const ext: any = { ...snapBase };
          if (job.progress) {
            ext.tokensUsed = job.progress.tokens_used;
            ext.tokensPrompt = job.progress.tokens_prompt;
            ext.tokensCompletion = job.progress.tokens_completion;
            ext.current = job.progress.current;
            ext.total = job.progress.total;
            ext.draftsSoFar = job.progress.drafts_so_far;
            ext.path = job.progress.path ?? null;
            ext.freeQuota = job.free_quota ?? null;
            ext.stage = snapBase.stage;

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
              if (ev.stage && ev.stage !== "queued" && !seen.has(ev.stage)) {
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

          const startedAtMs = resolveJobStartedAtMs({
            startedAt: job.progress?.started_at,
            events: job.progress?.events,
          });
          if (startedAtMs != null) ext.startedAt = startedAtMs;
          if (startedAtMs !== calmStartedAtRef.current) {
            calmEtaRef.current = null;
            calmStartedAtRef.current = startedAtMs;
            ewmaRef.current = null;
          }

          setFreeQuota(job.free_quota ?? null);
          if (!settledRef.current) upsert(ext);

          let eta: number | null = null;
          let projectedTokens: number | null = null;
          let projectedCards: number | null = null;
          if (startedAtMs != null && job.progress) {
            const nowMs = Date.now();
            const percent = job.progress.percent;
            ewmaRef.current = updateEwmaRate(
              ewmaRef.current,
              percent,
              nowMs,
            );
            const fromJob = job.progress.present_stages?.filter(
              (s) => s && s !== "queued",
            );
            const presentStages =
              fromJob && fromJob.length > 0
                ? fromJob
                : PROGRESS_STAGE_ORDER.filter((s) => s !== "queued");
            const rawEta = combineEtaMs({
              percent,
              stage: job.progress.stage ?? ext.stage,
              presentStages,
              ewma: ewmaRef.current,
              priors: job.eta_priors ?? null,
              current: job.progress.current,
              total: job.progress.total,
            });
            const calm = calmDisplayEtaMs({
              percent,
              previous: calmEtaRef.current,
              nowMs,
              rawEtaMs: rawEta,
            });
            calmEtaRef.current = calm.sample;
            eta = calm.etaMs;
            if (typeof job.progress.tokens_used === "number") {
              projectedTokens = projectTokensFromPercent(
                job.progress.tokens_used,
                percent,
              );
            }
            if (
              typeof job.progress.drafts_so_far === "number" &&
              job.progress.drafts_so_far > 0
            ) {
              projectedCards = projectCardsFromPercent(
                job.progress.drafts_so_far,
                percent,
              );
            }
          }
          setEstimates({
            etaMs: eta,
            projectedTokens,
            projectedCards,
          });

          const snapshotWithEstimates: ProgressSnapshot = {
            ...ext,
            etaMs: eta,
            projectedTokens,
            projectedCards,
          };

          setSnapshot(snapshotWithEstimates);
        }

        if (TERMINAL_OK.has(job.status)) {
          settleOk();
          return;
        }
        if (TERMINAL_FAIL.has(job.status)) {
          settleFail(job.error ?? "Generation failed");
          return;
        }
        const adv = advanceJobPollDeadline({
          status: job.status,
          heartbeatMs: resolveJobPollHeartbeatMs({
            updatedAt: job.progress?.updated_at,
            events: job.progress?.events,
            createdAt: job.created_at,
          }),
          nowMs: Date.now(),
          timeoutMs: JOB_POLL_RUNNING_TIMEOUT_MS,
        });
        if (adv.timedOut) {
          settleFail("Timed out waiting for generation");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        // Timeout / abort: keep polling so ETA ticks and a later response can land.
        const aborted =
          (err instanceof DOMException && err.name === "TimeoutError") ||
          (err instanceof Error &&
            (err.name === "AbortError" ||
              /aborted|timed out/i.test(err.message)));
        if (aborted) {
          applyEtaCountdown(Date.now());
        } else {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to poll job";
          settleFail(message);
          return;
        }
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
      if (etaTickTimer !== undefined) clearInterval(etaTickTimer);
      if (!settledRef.current) {
        fail(jobId);
      }
    };
  }, [jobId, upsert, complete, fail]);

  return { pending, ready, error, snapshot, freeQuota, estimates };
}
