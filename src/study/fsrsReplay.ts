import { createEmptyCard, Rating, type Card, type Grade } from "ts-fsrs";
import { fsrsForPrefs, type FsrsPrefs } from "./fsrsFactory";

export type ReviewLogReplayRow = {
  reviewed_at: string;
  rating: number;
};

export type RescheduleSummary = {
  cardsUpdated: number;
  cardsSkipped: number;
};

/** Map 1–4 review rating to ts-fsrs Grade (shared client + worker). */
export function ratingToGrade(rating: number): Grade | null {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
    default:
      return null;
  }
}

/** Replay chronological review logs under prefs (fuzz forced off). */
export function replayCardFromLogs(
  logs: readonly ReviewLogReplayRow[],
  prefs: FsrsPrefs,
): Card | null {
  const scheduler = fsrsForPrefs({ ...prefs, enableFuzz: false });
  const ordered = [...logs].sort((a, b) =>
    a.reviewed_at.localeCompare(b.reviewed_at),
  );
  let card: Card | null = null;
  for (const row of ordered) {
    const when = Date.parse(row.reviewed_at);
    if (!Number.isFinite(when)) continue;
    const grade = ratingToGrade(row.rating);
    if (grade == null) continue;
    const now = new Date(when);
    // Seed at first valid log; FSRS New ignores empty due.
    const base: Card = card ?? createEmptyCard(now);
    card = scheduler.next(base, now, grade).card;
  }
  return card;
}
