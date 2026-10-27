export function etaMs(elapsedMs: number, percent: number): number | null {
  if (percent < 5) {
    return null;
  }
  return (elapsedMs * (100 - percent)) / percent;
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
  if (draftsSoFar == null || current <= 0 || total <= 0) {
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
  if (args.draftsSoFar == null) {
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
  return Math.floor(
    cardsLeftThisJob + args.freeRemaining * projected,
  );
}
