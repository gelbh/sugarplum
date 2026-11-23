import { PROGRESS_STAGE_ORDER } from "./copy";

/** @deprecated Lifetime linear; kept for tests/legacy. Prefer combineEtaMs. */
export function etaMs(elapsedMs: number, percent: number): number | null {
  if (percent < 5) {
    return null;
  }
  return (elapsedMs * (100 - percent)) / percent;
}

export const ETA_EWMA_ALPHA = 0.25;
export const ETA_SEED_TOTAL_MS = 12 * 60 * 1000;
export const ETA_PRIOR_MIN_N = 3;

/** Static catalog weights (keep in lockstep with worker STAGE_WEIGHTS). */
export const CLIENT_STAGE_WEIGHTS: Record<string, number> = {
  queued: 0.02,
  extract: 0.08,
  figures: 0.1,
  rules: 0.05,
  claims: 0.15,
  generate: 0.2,
  critique: 0.3,
  persist: 0.1,
};

const CLIENT_STAGE_ORDER = Object.keys(CLIENT_STAGE_WEIGHTS);

/** Accept overlay when finite, known stages, and sum ≈ 1.0 (±0.01). */
function normalizeClientWeightOverlay(
  overlay: Partial<Record<string, number>> | null | undefined,
): Partial<Record<string, number>> | null {
  if (!overlay || typeof overlay !== "object") return null;
  const out: Partial<Record<string, number>> = {};
  let sum = 0;
  for (const [stage, raw] of Object.entries(overlay)) {
    if (!(stage in CLIENT_STAGE_WEIGHTS)) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return null;
    }
    out[stage] = raw;
    sum += raw;
  }
  if (Object.keys(out).length === 0) return null;
  if (Math.abs(sum - 1) > 0.01) return null;
  return out;
}

function clientOverlayCoversPresent(
  overlay: Partial<Record<string, number>>,
  presentStages: readonly string[],
): boolean {
  for (const stage of presentStages) {
    if (stage === "queued") continue;
    if (typeof overlay[stage] !== "number") return false;
  }
  return true;
}

/**
 * Mirror worker `effectiveWeights`: skipped catalog weights roll into generate
 * when present, else persist. Prefers a valid duration-share overlay when it
 * covers every non-queued present stage; else CLIENT_STAGE_WEIGHTS.
 */
export function effectiveClientWeights(
  presentStages: readonly string[],
  overlay?: Partial<Record<string, number>> | null,
): Record<string, number> {
  const present = new Set(presentStages);
  const normalized = normalizeClientWeightOverlay(overlay);
  const useOverlay =
    normalized != null && clientOverlayCoversPresent(normalized, presentStages);
  const weights: Record<string, number> = useOverlay
    ? Object.fromEntries(
        CLIENT_STAGE_ORDER.map((s) => [s, normalized![s] ?? 0]),
      )
    : { ...CLIENT_STAGE_WEIGHTS };
  let skipped = 0;
  for (const stage of CLIENT_STAGE_ORDER) {
    if (!present.has(stage)) {
      skipped += weights[stage] ?? 0;
      weights[stage] = 0;
    }
  }
  if (skipped > 0) {
    if (present.has("generate")) {
      weights.generate = (weights.generate ?? 0) + skipped;
    } else if (present.has("persist")) {
      weights.persist = (weights.persist ?? 0) + skipped;
    }
  }
  return weights;
}

export function defaultStageWeight(
  stage: string,
  presentStages?: readonly string[],
  overlay?: Partial<Record<string, number>> | null,
): number {
  if (presentStages && presentStages.length > 0) {
    return effectiveClientWeights(presentStages, overlay)[stage] ?? 0;
  }
  return CLIENT_STAGE_WEIGHTS[stage] ?? 0;
}

/** Durable ETA clock: started_at, else earliest progress event (no created_at / queue). */
export function resolveJobStartedAtMs(args: {
  startedAt?: string | null;
  events?: Array<{ at?: string | null }> | null;
}): number | null {
  if (typeof args.startedAt === "string") {
    const t = Date.parse(args.startedAt);
    if (Number.isFinite(t)) return t;
  }
  let earliest: number | null = null;
  for (const event of args.events ?? []) {
    if (typeof event?.at !== "string") continue;
    const t = Date.parse(event.at);
    if (!Number.isFinite(t)) continue;
    earliest = earliest == null ? t : Math.min(earliest, t);
  }
  return earliest;
}

/** Immutable anchor: raw ETA at percent change; display = countdown from anchor. */
export type CalmEtaSample = {
  percent: number;
  displayEtaMs: number;
  atMs: number;
};

export type EwmaRateState = {
  smoothedPerMs: number;
  samples: number;
  lastPercent: number;
  lastAtMs: number;
};

export type EtaPriors = {
  stages: Partial<Record<string, { p50_ms: number; n: number }>>;
};

/**
 * Calm ETA: recompute when percent changes (raw may grow); while flat,
 * countdown the anchor. When countdown hits 0, return null but keep anchor.
 */
export function calmDisplayEtaMs(args: {
  percent: number;
  previous: CalmEtaSample | null;
  nowMs: number;
  /** Precomputed combineEtaMs (or legacy etaMs) result. */
  rawEtaMs: number | null;
  /** @deprecated Ignored; use rawEtaMs. */
  elapsedMs?: number;
}): { etaMs: number | null; sample: CalmEtaSample | null } {
  if (args.percent < 5) {
    return { etaMs: null, sample: null };
  }

  const previous = args.previous;
  const shouldRecompute =
    previous == null || args.percent !== previous.percent;

  if (shouldRecompute) {
    const raw = args.rawEtaMs;
    if (raw == null) {
      return { etaMs: null, sample: null };
    }
    const sample: CalmEtaSample = {
      percent: args.percent,
      displayEtaMs: raw,
      atMs: args.nowMs,
    };
    return { etaMs: raw, sample };
  }

  const wallDelta = Math.max(0, args.nowMs - previous.atMs);
  const display = Math.max(0, previous.displayEtaMs - wallDelta);
  if (display === 0) {
    return { etaMs: null, sample: previous };
  }
  return { etaMs: display, sample: previous };
}

export function updateEwmaRate(
  prev: EwmaRateState | null,
  percent: number,
  atMs: number,
): EwmaRateState | null {
  if (!Number.isFinite(percent) || percent < 0) return prev;
  if (prev == null) {
    return {
      smoothedPerMs: 0,
      samples: 0,
      lastPercent: percent,
      lastAtMs: atMs,
    };
  }
  if (percent <= prev.lastPercent) {
    return prev;
  }
  const dt = atMs - prev.lastAtMs;
  const dPercent = percent - prev.lastPercent;
  if (dt <= 0 || dPercent <= 0) return prev;
  const instant = dPercent / dt;
  const smoothedPerMs =
    prev.samples === 0
      ? instant
      : ETA_EWMA_ALPHA * instant + (1 - ETA_EWMA_ALPHA) * prev.smoothedPerMs;
  return {
    smoothedPerMs,
    samples: prev.samples + 1,
    lastPercent: percent,
    lastAtMs: atMs,
  };
}

export function remainingPriorMs(args: {
  stage: string | null | undefined;
  presentStages: readonly string[];
  priors: EtaPriors | null | undefined;
  stageOrder?: readonly string[];
  stageWeight?: (stage: string) => number;
}): number {
  const order = args.stageOrder ?? PROGRESS_STAGE_ORDER;
  const weightFn =
    args.stageWeight ??
    ((s: string) => defaultStageWeight(s, args.presentStages));
  const stage = args.stage ?? "";
  const present = new Set(
    args.presentStages.filter((s) => s && s !== "queued"),
  );
  let pastCurrent = false;
  let sum = 0;
  for (const s of order) {
    if (s === "queued" || !present.has(s)) continue;
    if (!pastCurrent) {
      if (s === stage) pastCurrent = true;
      continue;
    }
    const prior = args.priors?.stages?.[s];
    if (prior && prior.n >= ETA_PRIOR_MIN_N) {
      sum += prior.p50_ms;
    } else {
      sum += weightFn(s) * ETA_SEED_TOTAL_MS;
    }
  }
  return sum;
}

export function combineEtaMs(args: {
  percent: number;
  stage: string | null | undefined;
  presentStages: readonly string[];
  ewma: EwmaRateState | null;
  priors: EtaPriors | null | undefined;
  current?: number;
  total?: number;
  stageWeight?: (stage: string) => number;
}): number | null {
  if (args.percent < 5) return null;
  const stage = args.stage;
  if (stage == null || stage === "queued") return null;

  const weightFn =
    args.stageWeight ??
    ((s: string) => defaultStageWeight(s, args.presentStages));
  const total = args.total ?? 0;
  const current = args.current ?? 0;
  const within =
    total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  const currentLeftWeight = weightFn(stage) * (1 - within);

  let currentMs: number;
  if (args.ewma && args.ewma.samples >= 2 && args.ewma.smoothedPerMs > 0) {
    currentMs = (currentLeftWeight * 100) / args.ewma.smoothedPerMs;
  } else {
    currentMs = currentLeftWeight * ETA_SEED_TOTAL_MS;
  }

  const futurePrior = remainingPriorMs({
    stage,
    presentStages: args.presentStages,
    priors: args.priors,
    stageWeight: weightFn,
  });

  const eta = currentMs + futurePrior;
  return Number.isFinite(eta) && eta > 0 ? eta : null;
}

/** Extrapolate job token total from usage so far and weighted percent. */
export function projectTokensFromPercent(
  used: number | undefined,
  percent: number,
): number | null {
  if (used == null || percent < 5) {
    return null;
  }
  return (used * 100) / percent;
}

/** Extrapolate job card count from drafts so far and weighted percent. */
export function projectCardsFromPercent(
  draftsSoFar: number | undefined,
  percent: number,
): number | null {
  if (draftsSoFar == null || draftsSoFar <= 0 || percent < 5) {
    return null;
  }
  return Math.ceil((draftsSoFar * 100) / percent);
}

export function projectTokens(
  used: number | undefined,
  current: number,
  total: number,
): number | null {
  if (used == null || current <= 0 || total <= 0) {
    return null;
  }
  return (used * total) / current;
}

export function projectCardsThisJob(
  draftsSoFar: number | undefined,
  current: number,
  total: number,
): number | null {
  // Mid-job drafts_so_far stays 0 until first batch; treat as unknown.
  if (draftsSoFar == null || draftsSoFar <= 0 || current <= 0 || total <= 0) {
    return null;
  }
  return Math.ceil((draftsSoFar * total) / current);
}

export function remainingCardsToday(args: {
  draftsSoFar: number | undefined;
  current: number;
  total: number;
  freeRemaining: number;
  priorCardsPerJob?: number | null;
}): number | null {
  if (args.draftsSoFar == null || args.draftsSoFar <= 0) {
    return null;
  }
  const projected =
    projectCardsThisJob(args.draftsSoFar, args.current, args.total) ??
    (args.priorCardsPerJob != null && args.priorCardsPerJob > 0
      ? args.priorCardsPerJob
      : null);
  if (projected == null) {
    return null;
  }
  const cardsLeftThisJob = Math.max(0, projected - args.draftsSoFar);
  return Math.floor(cardsLeftThisJob + args.freeRemaining * projected);
}
