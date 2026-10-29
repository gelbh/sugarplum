export function etaMs(elapsedMs: number, percent: number): number | null {
  if (percent < 5) {
    return null;
  }
  return (elapsedMs * (100 - percent)) / percent;
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

/**
 * Calm ETA: recompute when percent changes; while flat, countdown the anchor
 * (never grow). When countdown hits 0, return null ("Calculating…") but keep
 * the anchor so a later percent bump still recomputes.
 */
export function calmDisplayEtaMs(args: {
  elapsedMs: number;
  percent: number;
  previous: CalmEtaSample | null;
  nowMs: number;
}): { etaMs: number | null; sample: CalmEtaSample | null } {
  if (args.percent < 5) {
    return { etaMs: null, sample: null };
  }

  const previous = args.previous;
  const shouldRecompute =
    previous == null || args.percent !== previous.percent;

  if (shouldRecompute) {
    const raw = etaMs(args.elapsedMs, args.percent);
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
