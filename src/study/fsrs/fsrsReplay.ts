import { Rating, type Grade } from "ts-fsrs";
import {
  clampLearningStep,
  schedulerForPrefs,
  type FsrsPrefs,
} from "./fsrsFactory";
import { emptyFsrsCard, type FsrsSchedulerCard } from "./retrievability";

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

function normalizeSchedulerCard(card: {
  stability: number;
  difficulty: number;
  state: number;
  scheduleStatus: string;
  dueAt: Date;
  lastReviewAt: Date | null;
  cardId: string | number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep?: number;
  stabilityFast?: number;
}): FsrsSchedulerCard {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    scheduleStatus: card.scheduleStatus,
    dueAt: card.dueAt,
    lastReviewAt: card.lastReviewAt,
    cardId: String(card.cardId),
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduledDays,
    learningStep: clampLearningStep(card.learningStep ?? 0),
    ...(card.stabilityFast != null
      ? { stabilityFast: card.stabilityFast }
      : {}),
  };
}

/** Replay chronological review logs under prefs (fuzz forced off). */
export async function replayCardFromLogs(
  logs: readonly ReviewLogReplayRow[],
  prefs: FsrsPrefs,
  cardId: string = "replay",
): Promise<FsrsSchedulerCard | null> {
  const scheduler = await schedulerForPrefs({ ...prefs, enableFuzz: false });
  const ordered = [...logs].sort((a, b) =>
    a.reviewed_at.localeCompare(b.reviewed_at),
  );
  let card: FsrsSchedulerCard | null = null;
  for (const row of ordered) {
    const when = Date.parse(row.reviewed_at);
    if (!Number.isFinite(when)) continue;
    const grade = ratingToGrade(row.rating);
    if (grade == null) continue;
    const now = new Date(when);
    const base: FsrsSchedulerCard = card ?? emptyFsrsCard(now, cardId);
    card = normalizeSchedulerCard(
      scheduler.review({ card: base as never, grade, now }).card,
    );
  }
  return card;
}

export { normalizeSchedulerCard };
