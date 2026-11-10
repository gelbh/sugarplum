import type { CardDraftView } from "../api/client";
import type {
  GuestCardSchedule,
  GuestReviewLog,
} from "../guest/policyDue";
import type { FsrsPrefs } from "./fsrsFactory";
import {
  replayCardFromLogs,
  type RescheduleSummary,
  type ReviewLogReplayRow,
} from "./fsrsReplay";
import { scheduleColumnsFromCard } from "./retrievability";

export type GuestRescheduleInput = {
  cards: readonly CardDraftView[];
  schedules: Record<string, GuestCardSchedule>;
  reviewLogs: readonly GuestReviewLog[];
  prefs: FsrsPrefs;
  now?: Date;
};

export type GuestRescheduleResult = {
  cards: CardDraftView[];
  schedules: Record<string, GuestCardSchedule>;
  dueIds: string[];
  summary: RescheduleSummary;
};

function logsByCardId(
  reviewLogs: readonly GuestReviewLog[],
): Map<string, ReviewLogReplayRow[]> {
  const byCard = new Map<string, ReviewLogReplayRow[]>();
  for (const log of reviewLogs) {
    const list = byCard.get(log.cardId) ?? [];
    list.push({ reviewed_at: log.at, rating: log.rating });
    byCard.set(log.cardId, list);
  }
  return byCard;
}

/**
 * Replay guest review history under prefs and rewrite schedules + card dues.
 * Leaves reviewLogs untouched. Skips cards with no schedule or no valid logs.
 */
export async function rescheduleGuestSchedules(
  input: GuestRescheduleInput,
): Promise<GuestRescheduleResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const byCard = logsByCardId(input.reviewLogs);
  const schedules: Record<string, GuestCardSchedule> = { ...input.schedules };
  const dueByCardId = new Map<string, string>();
  let cardsUpdated = 0;
  let cardsSkipped = 0;

  for (const [cardId, logs] of byCard) {
    if (schedules[cardId] == null) {
      cardsSkipped += 1;
      continue;
    }
    const next = await replayCardFromLogs(logs, input.prefs, cardId);
    if (!next) {
      cardsSkipped += 1;
      continue;
    }
    const cols = scheduleColumnsFromCard(next);
    schedules[cardId] = {
      state: cols.state,
      reps: cols.reps,
      lapses: cols.lapses,
      stability: cols.stability,
      difficulty: cols.difficulty,
      elapsed_days: cols.elapsed_days,
      scheduled_days: cols.scheduled_days,
      learning_steps: cols.learning_steps,
      last_review: cols.last_review,
      stability_fast: cols.stability_fast,
    };
    dueByCardId.set(cardId, cols.due);
    cardsUpdated += 1;
  }

  const cards = input.cards.map((card) => {
    const due = dueByCardId.get(card.id);
    if (due == null) return card;
    return { ...card, due, updated_at: nowIso };
  });

  // Full rebuild (not grade-path cycle order): accepted cards due by now.
  const dueIds = cards
    .filter(
      (card) =>
        card.status === "accepted" &&
        typeof card.due === "string" &&
        card.due.length > 0 &&
        card.due <= nowIso,
    )
    .map((card) => card.id);

  return {
    cards,
    schedules,
    dueIds,
    summary: { cardsUpdated, cardsSkipped },
  };
}
