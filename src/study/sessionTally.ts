export type GradeTally = {
  again: number;
  hard: number;
  good: number;
  easy: number;
};

export function emptyTally(): GradeTally {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

export function addGrade(tally: GradeTally, rating: 1 | 2 | 3 | 4): GradeTally {
  const next = { ...tally };
  if (rating === 1) next.again += 1;
  else if (rating === 2) next.hard += 1;
  else if (rating === 3) next.good += 1;
  else next.easy += 1;
  return next;
}

export function gradedTotal(tally: GradeTally): number {
  return tally.again + tally.hard + tally.good + tally.easy;
}

export type SessionSurface = "fresh" | "quiet" | "soft_wait" | "complete";

/** @deprecated Prefer sessionSurface; kept as zero-pending alias. */
export type SessionEndKind = Exclude<SessionSurface, "soft_wait">;

export function sessionSurface(
  hadCards: boolean,
  gradedCount: number,
  pendingLearningCount: number,
): SessionSurface {
  if (!hadCards) return "fresh";
  if (pendingLearningCount > 0) return "soft_wait";
  if (gradedCount > 0) return "complete";
  return "quiet";
}

export function sessionEndKind(
  hadCards: boolean,
  gradedCount: number,
): SessionEndKind {
  const surface = sessionSurface(hadCards, gradedCount, 0);
  return surface === "soft_wait" ? "quiet" : surface;
}
