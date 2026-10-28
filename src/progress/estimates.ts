export function etaMs(elapsedMs: number, percent: number): number | null {
  if (percent < 5) {
    return null;
  }
  return (elapsedMs * (100 - percent)) / percent;
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
