export type GradeTally = {
  again: number;
  hard: number;
  good: number;
  easy: number;
};

export function emptyTally(): GradeTally {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

export function addGrade(
  tally: GradeTally,
  rating: 1 | 2 | 3 | 4,
): GradeTally {
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

export type SessionEndKind = "fresh" | "quiet" | "complete";

export function sessionEndKind(
  hadCards: boolean,
  gradedCount: number,
): SessionEndKind {
  if (!hadCards) return "fresh";
  if (gradedCount > 0) return "complete";
  return "quiet";
}
