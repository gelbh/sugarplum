import type { Env } from "../env";
import { getDb } from "../db/client";
import {
  STAGE_ORDER,
  STAGE_WEIGHTS,
  normalizeWeightOverlay,
  type ProgressStage,
} from "./progress";

export const STAGE_DURATION_KV_KEY = "eta:stage_durations:v1";
export const STAGE_DURATION_KV_TTL_SECONDS = 30 * 24 * 60 * 60;
export const STAGE_DURATION_RING_MAX = 24;
export const STAGE_DURATION_MIN_MS = 200;
export const STAGE_DURATION_MAX_MS = 7_200_000;
export const STAGE_PRIOR_MIN_N = 3;
/** Gate before writing duration-share STAGE_WEIGHTS overlay. */
export const STAGE_WEIGHT_OVERLAY_MIN_N = 5;
export const STAGE_WEIGHT_SUM_TOLERANCE = 0.01;
/** Isolate-local TTL so progress emit does not hit KV every tick. */
export const STAGE_WEIGHT_OVERLAY_CACHE_TTL_MS = 30_000;

export type StageDurationRollup = {
  v: 1;
  updated_at: string;
  stages: Partial<
    Record<string, { samples_ms: number[]; p50_ms: number }>
  >;
  /** Duration-share overlay; written when every present stage has n≥5. */
  weights?: Partial<Record<string, number>>;
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
 * p50 duration shares for rollup stages with enough samples.
 * Excludes queued. Null when any present stage is below the n≥5 gate.
 */
export function computeDurationShareWeights(
  stages: StageDurationRollup["stages"],
): Partial<Record<string, number>> | null {
  const present: Array<{ stage: string; p50: number; n: number }> = [];
  for (const [stage, row] of Object.entries(stages)) {
    if (stage === "queued" || !KNOWN.has(stage) || !row) continue;
    if (!Array.isArray(row.samples_ms)) continue;
    if (typeof row.p50_ms !== "number" || !Number.isFinite(row.p50_ms)) {
      continue;
    }
    if (row.p50_ms <= 0) continue;
    present.push({
      stage,
      p50: row.p50_ms,
      n: row.samples_ms.length,
    });
  }
  if (present.length === 0) return null;
  if (present.some((s) => s.n < STAGE_WEIGHT_OVERLAY_MIN_N)) return null;

  const sum = present.reduce((acc, s) => acc + s.p50, 0);
  if (!(sum > 0)) return null;

  const weights: Partial<Record<string, number>> = {};
  for (const s of present) {
    weights[s.stage] = s.p50 / sum;
  }
  return weights;
}

type OverlayCache = {
  atMs: number;
  value: Partial<Record<ProgressStage, number>> | null;
};

let overlayCache: OverlayCache | null = null;

/** Test-only: clear isolate overlay cache. */
export function resetStageWeightOverlayCacheForTests(): void {
  overlayCache = null;
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
  const entries: Array<[string, number]> = [];
  for (const [stage, raw] of Object.entries(sample)) {
    if (!KNOWN.has(stage) || typeof raw !== "number" || !inRange(raw)) {
      continue;
    }
    entries.push([stage, raw]);
  }
  if (entries.length === 0) return;

  const existing = parseRollup(await kv.get(STAGE_DURATION_KV_KEY));
  const stages: StageDurationRollup["stages"] = {
    ...(existing?.stages ?? {}),
  };

  for (const [stage, ms] of entries) {
    const prev = stages[stage]?.samples_ms ?? [];
    const samples: number[] = [...prev, ms].slice(-STAGE_DURATION_RING_MAX);
    const sorted = [...samples].sort((a, b) => a - b);
    stages[stage] = {
      samples_ms: samples,
      p50_ms: percentileMs(sorted, 0.5),
    };
  }

  const shares = computeDurationShareWeights(stages);
  const body: StageDurationRollup = {
    v: 1,
    updated_at: nowIso,
    stages,
    ...(shares ? { weights: shares } : {}),
  };
  await kv.put(STAGE_DURATION_KV_KEY, JSON.stringify(body), {
    expirationTtl: STAGE_DURATION_KV_TTL_SECONDS,
  });
  overlayCache = null;
}

/** Cached KV read of duration-share weights; null on miss/corrupt. */
export async function readStageWeightOverlay(
  kv: KVNamespace,
  nowMs: number = Date.now(),
): Promise<Partial<Record<ProgressStage, number>> | null> {
  if (
    overlayCache &&
    nowMs - overlayCache.atMs < STAGE_WEIGHT_OVERLAY_CACHE_TTL_MS
  ) {
    return overlayCache.value;
  }
  const rollup = parseRollup(await kv.get(STAGE_DURATION_KV_KEY));
  const value = normalizeWeightOverlay(rollup?.weights ?? null);
  overlayCache = { atMs: nowMs, value };
  return value;
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

/** Ops: compare job wall clock to sum of rollup p50 for stages in the sample. */
export function etaAccuracySnapshot(args: {
  startedAt?: string | null;
  finishedAt?: string | null;
  sampleStages: readonly string[];
  stageP50: Partial<Record<string, number>>;
}): { wallMs: number; p50SumMs: number } | null {
  const startedMs = parseIsoMs(args.startedAt);
  const finishedMs = parseIsoMs(args.finishedAt);
  if (startedMs == null || finishedMs == null || finishedMs <= startedMs) {
    return null;
  }
  let p50SumMs = 0;
  for (const stage of args.sampleStages) {
    const p50 = args.stageP50[stage];
    if (typeof p50 === "number" && Number.isFinite(p50)) {
      p50SumMs += p50;
    }
  }
  return { wallMs: finishedMs - startedMs, p50SumMs };
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

    const rollup = parseRollup(await env.CACHE.get(STAGE_DURATION_KV_KEY));
    const stageP50: Partial<Record<string, number>> = {};
    for (const [stage, entry] of Object.entries(rollup?.stages ?? {})) {
      if (entry && typeof entry.p50_ms === "number") {
        stageP50[stage] = entry.p50_ms;
      }
    }
    const accuracy = etaAccuracySnapshot({
      startedAt: progress.started_at,
      finishedAt: row.finished_at,
      sampleStages: Object.keys(sample),
      stageP50,
    });
    if (accuracy) {
      console.info("eta accuracy", { jobId, ...accuracy });
    }
  } catch (err) {
    console.error("stage duration rollup failed", jobId, err);
  }
}
