import { State } from "ts-fsrs";
import {
  DEFAULT_EASY_DAYS,
  type EasyDay,
} from "./loadBalance";
import { cardFromScheduleRow, retrievability } from "./retrievability";

export type { EasyDay };

/** Durable study pacing prefs (DB / settings). Session bonus is not stored here. */
export type StudyPrefs = {
  introBudget: number;
  reviewBudget: number;
  rFloor: number;
  desiredRetention: number;
  enableFuzz: boolean;
  enableLoadBalance: boolean;
  /** Mon=0 … Sun=6 */
  easyDays: EasyDay[];
};

export type QueueCandidate = {
  id: string;
  deck_id: string;
  due: string;
  state: number;
  reps: number;
  last_review: string | null;
  lapses: number;
  again_14d?: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  stability_fast?: number | null;
};

export type QueueResult = {
  dueIds: string[];
  selected: QueueCandidate[];
  deferrals: { id: string; newDue: string }[];
  meta: {
    introUsed: number;
    introBudget: number;
    introAlreadyUsedToday: number;
    introRemaining: number;
    reviewUsed: number;
    reviewBudget: number;
    heldIntroCount: number;
    deferredCount: number;
  };
};

export type BuildStudyQueueOpts = {
  /** Overdue boundary (prefer server UTC day start when applying mutations). */
  overdueDayStartIso: string;
  introBonusSlices?: number;
  /** Intros already counted for this local day (first reviews / ledger). */
  introAlreadyUsedToday?: number;
};

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  introBudget: 20,
  reviewBudget: 200,
  rFloor: 0.9,
  desiredRetention: 0.9,
  enableFuzz: true,
  enableLoadBalance: true,
  easyDays: [...DEFAULT_EASY_DAYS],
};

const MS_PER_DAY = 86_400_000;

/** Intro-eligible: New state, or never reviewed (reps 0 + null last_review). */
export function isIntroEligible(c: QueueCandidate): boolean {
  return c.state === State.New || (c.reps === 0 && c.last_review == null);
}

function byDueThenId(a: QueueCandidate, b: QueueCandidate): number {
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** Deterministic round-robin by deck; preserves within-deck input order. */
function interleaveByDeck(cards: QueueCandidate[]): QueueCandidate[] {
  if (cards.length <= 1) return cards;
  const buckets = new Map<string, QueueCandidate[]>();
  for (const c of cards) {
    const list = buckets.get(c.deck_id);
    if (list) list.push(c);
    else buckets.set(c.deck_id, [c]);
  }
  if (buckets.size <= 1) return cards;
  const deckIds = [...buckets.keys()].sort();
  const out: QueueCandidate[] = [];
  let remaining = cards.length;
  while (remaining > 0) {
    for (const deckId of deckIds) {
      const list = buckets.get(deckId);
      if (!list || list.length === 0) continue;
      out.push(list.shift()!);
      remaining--;
    }
  }
  return out;
}

function isLearningOrRelearning(c: QueueCandidate): boolean {
  return c.state === State.Learning || c.state === State.Relearning;
}

function isOverdue(c: QueueCandidate, overdueDayStartIso: string): boolean {
  return c.due < overdueDayStartIso;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + days * MS_PER_DAY);
  return d.toISOString();
}

/**
 * Smallest whole days in [1, 3] that keeps predicted R ≥ floor.
 * Returns null when the card must not be deferred.
 */
function tryDeferral(
  c: QueueCandidate,
  prefs: StudyPrefs,
  now: Date,
  overdueDayStartIso: string,
  rNow: number | null,
): { newDue: string } | null {
  if (isLearningOrRelearning(c)) return null;
  if (isOverdue(c, overdueDayStartIso)) return null;
  const floor = prefs.desiredRetention;
  if (rNow == null || rNow < floor) return null;

  const card = cardFromScheduleRow(c);
  for (let days = 1; days <= 3; days++) {
    const at = new Date(now.getTime() + days * MS_PER_DAY);
    const rLater = retrievability(card, at);
    if (rLater != null && rLater >= floor) {
      return { newDue: addDaysIso(c.due, days) };
    }
  }
  return null;
}

export function buildStudyQueue(
  candidates: QueueCandidate[],
  prefs: StudyPrefs,
  now: Date,
  opts: BuildStudyQueueOpts,
): QueueResult {
  const overdueDayStartIso = opts.overdueDayStartIso;
  const bonus = Math.max(0, opts.introBonusSlices ?? 0);
  const introAlreadyUsedToday = Math.max(0, opts.introAlreadyUsedToday ?? 0);
  const effectiveCap = prefs.introBudget * (1 + bonus);
  const introRemaining = Math.max(0, effectiveCap - introAlreadyUsedToday);

  const introEligible = candidates.filter(isIntroEligible).sort(byDueThenId);
  const reviews = candidates.filter((c) => !isIntroEligible(c));

  const selectedIntro = introEligible.slice(0, introRemaining);
  const heldIntroCount = introEligible.length - selectedIntro.length;

  const rById = new Map<string, number | null>();
  for (const c of reviews) {
    try {
      rById.set(c.id, retrievability(cardFromScheduleRow(c), now));
    } catch {
      rById.set(c.id, null);
    }
  }

  const mustInclude: QueueCandidate[] = [];
  const deferrable: { c: QueueCandidate; newDue: string }[] = [];

  for (const c of reviews) {
    const rNow = rById.get(c.id) ?? null;
    const defer = tryDeferral(c, prefs, now, overdueDayStartIso, rNow);
    if (defer) deferrable.push({ c, newDue: defer.newDue });
    else mustInclude.push(c);
  }

  deferrable.sort((a, b) => {
    const rA = rById.get(a.c.id);
    const rB = rById.get(b.c.id);
    const nA = rA == null ? -1 : rA;
    const nB = rB == null ? -1 : rB;
    if (nA !== nB) return nA - nB;
    if (b.c.lapses !== a.c.lapses) return b.c.lapses - a.c.lapses;
    const againA = a.c.again_14d ?? 0;
    const againB = b.c.again_14d ?? 0;
    if (againB !== againA) return againB - againA;
    return byDueThenId(a.c, b.c);
  });

  let selectedReviews: QueueCandidate[];
  let deferrals: { id: string; newDue: string }[];

  if (reviews.length <= prefs.reviewBudget) {
    selectedReviews = [...reviews];
    deferrals = [];
  } else {
    const slotsForDeferrable = Math.max(
      0,
      prefs.reviewBudget - mustInclude.length,
    );
    const keep = deferrable.slice(0, slotsForDeferrable);
    const drop = deferrable.slice(slotsForDeferrable);
    selectedReviews = [...mustInclude, ...keep.map((x) => x.c)];
    deferrals = drop.map((x) => ({ id: x.c.id, newDue: x.newDue }));
  }

  const bandLearning = selectedReviews
    .filter(isLearningOrRelearning)
    .sort(byDueThenId);
  const bandOtherReviews = interleaveByDeck(
    selectedReviews
      .filter((c) => !isLearningOrRelearning(c))
      .sort((a, b) => {
        const rA = rById.get(a.id);
        const rB = rById.get(b.id);
        const nA =
          rA == null || Number.isNaN(rA) ? Number.POSITIVE_INFINITY : rA;
        const nB =
          rB == null || Number.isNaN(rB) ? Number.POSITIVE_INFINITY : rB;
        if (nA !== nB) return nA - nB;
        return byDueThenId(a, b);
      }),
  );
  const bandIntro = interleaveByDeck([...selectedIntro].sort(byDueThenId));

  const selected = [...bandLearning, ...bandOtherReviews, ...bandIntro];
  const dueIds = selected.map((c) => c.id);

  return {
    dueIds,
    selected,
    deferrals,
    meta: {
      introUsed: selectedIntro.length,
      introBudget: prefs.introBudget,
      introAlreadyUsedToday,
      introRemaining,
      reviewUsed: selectedReviews.length,
      reviewBudget: prefs.reviewBudget,
      heldIntroCount,
      deferredCount: deferrals.length,
    },
  };
}
