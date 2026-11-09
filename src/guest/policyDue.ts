import { State } from "ts-fsrs";
import type {
  CardDraftView,
  ListDueOpts,
  ListDueResult,
  StrugglingRow,
  StudyRating,
} from "../api/client";
import { clientLocalDay, serverUtcDayStartIso } from "../study/localDay";
import {
  buildStudyQueue,
  type QueueCandidate,
  type StudyPrefs,
} from "../study/policyQueue";
import { cardFromScheduleRow, retrievability } from "../study/retrievability";
import { cardHasRegenSource } from "../study/regenSource";
import { rankWeakness, type WeaknessCandidate } from "../study/weakness";

const MS_PER_DAY = 86_400_000;

/** Optional FSRS schedule columns for guest cards (absent → New defaults). */
export type GuestCardSchedule = {
  state: number;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  last_review: string | null;
};

export type GuestReviewLog = {
  cardId: string;
  rating: StudyRating;
  at: string;
  /** Pre-transition FSRS state; absent on historical thin logs. */
  state?: number;
};

export function cardDueIso(card: CardDraftView, fallback: string): string {
  return typeof card.due === "string" && card.due.length > 0
    ? card.due
    : fallback;
}

export function toQueueCandidate(
  card: CardDraftView,
  schedules: Record<string, GuestCardSchedule>,
  nowIsoValue: string,
): QueueCandidate {
  const due = cardDueIso(card, nowIsoValue);
  const sched = schedules[card.id];
  if (!sched) {
    return {
      id: card.id,
      deck_id: card.deck_id,
      due,
      state: State.New,
      reps: 0,
      last_review: null,
      lapses: 0,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
    };
  }
  return {
    id: card.id,
    deck_id: card.deck_id,
    due,
    state: sched.state,
    reps: sched.reps,
    last_review: sched.last_review,
    lapses: sched.lapses,
    stability: sched.stability,
    difficulty: sched.difficulty,
    elapsed_days: sched.elapsed_days,
    scheduled_days: sched.scheduled_days,
    learning_steps: sched.learning_steps,
  };
}

function frontJsonFor(card: CardDraftView): string {
  if (typeof card.front === "string") return card.front;
  return JSON.stringify(card.front);
}

export type GuestPolicyInput = {
  cards: CardDraftView[];
  decks: Array<{ id: string; subject_id: string }>;
  schedules: Record<string, GuestCardSchedule>;
  studyPrefs: StudyPrefs;
  reviewLogs: GuestReviewLog[];
  introsByDay: Record<string, number>;
};

export function buildGuestDueResult(
  input: GuestPolicyInput,
  opts:
    | Pick<
        ListDueOpts,
        "deckId" | "subjectId" | "localDay" | "tzOffsetMinutes" | "introBonus"
      >
    | undefined,
  now: Date = new Date(),
): {
  result: ListDueResult;
  pendingDeferrals: { id: string; newDue: string }[];
} {
  const nowIsoValue = now.toISOString();
  const day = opts?.localDay ?? clientLocalDay(now);
  const introAlreadyUsedToday = input.introsByDay[day] ?? 0;

  let accepted = input.cards.filter((c) => c.status === "accepted");
  if (opts?.deckId) {
    accepted = accepted.filter((c) => c.deck_id === opts.deckId);
  } else if (opts?.subjectId) {
    const deckIds = new Set(
      input.decks
        .filter((d) => d.subject_id === opts.subjectId)
        .map((d) => d.id),
    );
    accepted = accepted.filter((c) => deckIds.has(c.deck_id));
  }

  const dueCards = accepted.filter(
    (c) => cardDueIso(c, nowIsoValue) <= nowIsoValue,
  );
  const candidates = dueCards.map((c) =>
    toQueueCandidate(c, input.schedules, nowIsoValue),
  );

  const queue = buildStudyQueue(candidates, input.studyPrefs, now, {
    overdueDayStartIso: serverUtcDayStartIso(now),
    introBonusSlices: opts?.introBonus ?? 0,
    introAlreadyUsedToday,
  });

  const byId = new Map(input.cards.map((c) => [c.id, c]));
  const cards = queue.dueIds
    .map((id) => byId.get(id))
    .filter((c): c is CardDraftView => c != null);

  return {
    result: { cards, meta: queue.meta },
    pendingDeferrals: queue.deferrals,
  };
}

export function buildGuestStruggling(
  input: GuestPolicyInput,
  now: Date = new Date(),
): StrugglingRow[] {
  const nowIsoValue = now.toISOString();
  const since = new Date(now.getTime() - 14 * MS_PER_DAY).toISOString();
  const accepted = input.cards.filter((c) => c.status === "accepted");
  if (accepted.length === 0 || input.reviewLogs.length === 0) {
    return [];
  }

  const counts = new Map<
    string,
    { again_14d: number; hard_14d: number; last_review: string | null }
  >();
  for (const log of input.reviewLogs) {
    if (log.at < since) continue;
    const cur = counts.get(log.cardId) ?? {
      again_14d: 0,
      hard_14d: 0,
      last_review: null as string | null,
    };
    if (log.rating === 1) cur.again_14d += 1;
    else if (log.rating === 2) cur.hard_14d += 1;
    if (cur.last_review == null || log.at > cur.last_review) {
      cur.last_review = log.at;
    }
    counts.set(log.cardId, cur);
  }

  const candidates: (WeaknessCandidate & { has_regen_source: boolean })[] = [];
  for (const card of accepted) {
    const tallies = counts.get(card.id);
    if (!tallies) continue;
    const sched = input.schedules[card.id];
    let r: number | null = null;
    if (sched && sched.last_review != null && sched.state !== State.New) {
      try {
        r = retrievability(
          cardFromScheduleRow({
            due: cardDueIso(card, nowIsoValue),
            stability: sched.stability,
            difficulty: sched.difficulty,
            elapsed_days: sched.elapsed_days,
            scheduled_days: sched.scheduled_days,
            learning_steps: sched.learning_steps,
            reps: sched.reps,
            lapses: sched.lapses,
            state: sched.state,
            last_review: sched.last_review,
          }),
          now,
        );
      } catch {
        r = null;
      }
    }
    candidates.push({
      id: card.id,
      deck_id: card.deck_id,
      type: String(card.type),
      front_json: frontJsonFor(card),
      lapses: sched?.lapses ?? 0,
      again_14d: tallies.again_14d,
      hard_14d: tallies.hard_14d,
      difficulty: sched?.difficulty ?? 0,
      due: cardDueIso(card, nowIsoValue),
      last_review: sched?.last_review ?? tallies.last_review,
      retrievability: r,
      has_regen_source: cardHasRegenSource(card),
    });
  }

  return rankWeakness(candidates, nowIsoValue);
}
