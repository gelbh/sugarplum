import type { Env } from "../env";
import { getDb } from "../db/client";
import {
  STAGE_ORDER,
  STAGE_WEIGHTS,
  type ProgressStage,
} from "./progress";

export const STAGE_DURATION_KV_KEY = "eta:stage_durations:v1";
export const STAGE_DURATION_KV_TTL_SECONDS = 30 * 24 * 60 * 60;
export const STAGE_DURATION_RING_MAX = 24;
export const STAGE_DURATION_MIN_MS = 200;
export const STAGE_DURATION_MAX_MS = 7_200_000;
export const STAGE_PRIOR_MIN_N = 3;

export type StageDurationRollup = {
  v: 1;
  updated_at: string;
  stages: Partial<
    Record<string, { samples_ms: number[]; p50_ms: number }>
  >;
};

export type EtaPriorsPayload = {
  stages: Partial<Record<string, { p50_ms: number; n: number }>>;
};

const KNOWN = new Set<string>(Object.keys(STAGE_WEIGHTS));

function parseIsoMs(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function inRange(ms: number): boolean {
  return (
    Number.isFinite(ms) &&
    ms >= STAGE_DURATION_MIN_MS &&
    ms <= STAGE_DURATION_MAX_MS
  );
}

/** Nearest-rank p50 on ascending samples (1-indexed rank ceil(n*0.5)). */
export function percentileMs(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, p));
  const rank = Math.max(1, Math.ceil(sortedAsc.length * clamped));
  return sortedAsc[rank - 1]!;
}

/**
 * First sighting of each non-queued stage → durations between consecutive
 * sightings; last stage uses finishedAt (else last event time).
 */
export function deriveStageDurationsMs(args: {
  startedAt?: string | null;
  finishedAt?: string | null;
  events?: Array<{ at?: string | null; stage?: string | null }> | null;
}): Partial<Record<ProgressStage, number>> {
  const firstAt = new Map<string, number>();
  for (const event of args.events ?? []) {
    const stage = event?.stage;
    if (typeof stage !== "string" || stage === "queued" || !KNOWN.has(stage)) {
      continue;
    }
    if (firstAt.has(stage)) continue;
    const t = parseIsoMs(event.at);
    if (t == null) continue;
    firstAt.set(stage, t);
  }

  const ordered = STAGE_ORDER.filter(
    (s) => s !== "queued" && firstAt.has(s),
  );
  if (ordered.length === 0) return {};

  const tend =
    parseIsoMs(args.finishedAt) ??
    Math.max(...ordered.map((s) => firstAt.get(s)!));

  const out: Partial<Record<ProgressStage, number>> = {};
  for (let i = 0; i < ordered.length; i++) {
    const stage = ordered[i]!;
    const t0 = firstAt.get(stage)!;
    const t1 =
      i + 1 < ordered.length ? firstAt.get(ordered[i + 1]!)! : tend;
    const dur = t1 - t0;
    if (inRange(dur)) {
      out[stage] = dur;
    }
  }
  return out;
}

function parseRollup(raw: string | null): StageDurationRollup | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as StageDurationRollup;
    if (!parsed || parsed.v !== 1 || typeof parsed.stages !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Best-effort read-modify-write. Concurrent job finals may drop a sample;
 * acceptable for v1 ring noise (no CAS). See ETA accuracy design §KV rollup.
 */
export async function mergeStageDurationRollup(
  kv: KVNamespace,
  sample: Partial<Record<string, number>>,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const entries = Object.entries(sample).filter(
    ([stage, ms]) => KNOWN.has(stage) && typeof ms === "number" && inRange(ms),
  );
  if (entries.length === 0) return;

  const existing = parseRollup(await kv.get(STAGE_DURATION_KV_KEY));
  const stages: StageDurationRollup["stages"] = {
    ...(existing?.stages ?? {}),
  };

  for (const [stage, ms] of entries) {
    const prev = stages[stage]?.samples_ms ?? [];
    const samples = [...prev, ms].slice(-STAGE_DURATION_RING_MAX);
    const sorted = [...samples].sort((a, b) => a - b);
    stages[stage] = {
      samples_ms: samples,
      p50_ms: percentileMs(sorted, 0.5),
    };
  }

  const body: StageDurationRollup = {
    v: 1,
    updated_at: nowIso,
    stages,
  };
  await kv.put(STAGE_DURATION_KV_KEY, JSON.stringify(body), {
    expirationTtl: STAGE_DURATION_KV_TTL_SECONDS,
  });
}

export async function readEtaPriors(
  kv: KVNamespace,
): Promise<EtaPriorsPayload | null> {
  const rollup = parseRollup(await kv.get(STAGE_DURATION_KV_KEY));
  if (!rollup) return null;
  const stages: EtaPriorsPayload["stages"] = {};
  for (const [stage, row] of Object.entries(rollup.stages)) {
    if (!row || !Array.isArray(row.samples_ms)) continue;
    const n = row.samples_ms.length;
    if (n < STAGE_PRIOR_MIN_N) continue;
    if (typeof row.p50_ms !== "number" || !Number.isFinite(row.p50_ms)) {
      continue;
    }
    stages[stage] = { p50_ms: row.p50_ms, n };
  }
  if (Object.keys(stages).length === 0) return null;
  return { stages };
}

/** Best-effort: merge durations after successful terminal only. */
export async function recordStageDurationsBestEffort(
  env: Env,
  jobId: string,
): Promise<void> {
  try {
    if (!env.CACHE) return;
    const row = await getDb(env)
      .prepare(
        "SELECT status, progress_json, finished_at FROM generation_jobs WHERE id = ?",
      )
      .bind(jobId)
      .first<{
        status: string;
        progress_json: string | null;
        finished_at: string | null;
      }>();
    if (!row) return;
    if (row.status !== "needs_review" && row.status !== "done") return;

    let progress: {
      started_at?: string;
      events?: Array<{ at?: string; stage?: string }>;
    } = {};
    if (row.progress_json) {
      try {
        progress = JSON.parse(row.progress_json) as typeof progress;
      } catch {
        return;
      }
    }

    const sample = deriveStageDurationsMs({
      startedAt: progress.started_at,
      finishedAt: row.finished_at,
      events: progress.events,
    });
    if (Object.keys(sample).length === 0) return;
    await mergeStageDurationRollup(env.CACHE, sample);
  } catch (err) {
    console.error("stage duration rollup failed", jobId, err);
  }
}
