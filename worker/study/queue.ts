import { State } from "ts-fsrs";
import { cardFromScheduleRow, retrievability } from "./fsrs";

export type StudyPrefs = {
  introBudget: number; // default 20
  reviewBudget: number; // default 200
  rFloor: number; // default 0.80
  introBonusSlices?: number; // Study more for local day
};

export type QueueCandidate = {
  id: string;
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
};

export type QueueResult = {
  dueIds: string[];
  selected: QueueCandidate[];
  deferrals: { id: string; newDue: string }[];
  meta: {
    introUsed: number;
    introBudget: number;
    reviewUsed: number;
    reviewBudget: number;
    heldIntroCount: number;
    deferredCount: number;
  };
};

const MS_PER_DAY = 86_400_000;

/** Intro-eligible: New state, or never reviewed (reps 0 + null last_review). */
export function isIntroEligible(c: QueueCandidate): boolean {
  return (
    c.state === State.New || (c.reps === 0 && c.last_review == null)
  );
}

function byDueThenId(a: QueueCandidate, b: QueueCandidate): number {
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function isLearningOrRelearning(c: QueueCandidate): boolean {
  return c.state === State.Learning || c.state === State.Relearning;
}

function isOverdue(c: QueueCandidate, localDayStartIso: string): boolean {
  return c.due < localDayStartIso;
}

function currentR(c: QueueCandidate, now: Date): number | null {
  try {
    return retrievability(cardFromScheduleRow(c), now);
  } catch {
    return null;
  }
}

/** Urgency: keep lower R, higher lapses, higher again_14d, earlier due first. */
function byUrgencyDesc(
  a: QueueCandidate,
  b: QueueCandidate,
  now: Date,
): number {
  const rA = currentR(a, now);
  const rB = currentR(b, now);
  const nA = rA == null ? -1 : rA;
  const nB = rB == null ? -1 : rB;
  if (nA !== nB) return nA - nB;
  if (b.lapses !== a.lapses) return b.lapses - a.lapses;
  const againA = a.again_14d ?? 0;
  const againB = b.again_14d ?? 0;
  if (againB !== againA) return againB - againA;
  return byDueThenId(a, b);
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
  localDayStartIso: string,
): { newDue: string } | null {
  if (isLearningOrRelearning(c)) return null;
  if (isOverdue(c, localDayStartIso)) return null;

  const card = cardFromScheduleRow(c);
  const rNow = retrievability(card, now);
  if (rNow == null || rNow < prefs.rFloor) return null;

  for (let days = 1; days <= 3; days++) {
    const at = new Date(now.getTime() + days * MS_PER_DAY);
    const rLater = retrievability(card, at);
    if (rLater != null && rLater >= prefs.rFloor) {
      return { newDue: addDaysIso(c.due, days) };
    }
  }
  return null;
}

export function buildStudyQueue(
  candidates: QueueCandidate[],
  prefs: StudyPrefs,
  now: Date,
  localDayStartIso: string,
): QueueResult {
  const introEligible = candidates
    .filter(isIntroEligible)
    .sort(byDueThenId);
  const reviews = candidates.filter((c) => !isIntroEligible(c));

  const bonus = prefs.introBonusSlices ?? 0;
  const effectiveIntroBudget = prefs.introBudget * (1 + bonus);
  const selectedIntro = introEligible.slice(0, effectiveIntroBudget);
  const heldIntroCount = introEligible.length - selectedIntro.length;

  const mustInclude: QueueCandidate[] = [];
  const deferrable: { c: QueueCandidate; newDue: string }[] = [];

  for (const c of reviews) {
    const defer = tryDeferral(c, prefs, now, localDayStartIso);
    if (defer) deferrable.push({ c, newDue: defer.newDue });
    else mustInclude.push(c);
  }

  deferrable.sort((a, b) => byUrgencyDesc(a.c, b.c, now));

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

  const mustIds = new Set(mustInclude.map((c) => c.id));
  const bandForced = selectedReviews
    .filter((c) => isLearningOrRelearning(c) || mustIds.has(c.id))
    .sort(byDueThenId);
  const bandForcedIds = new Set(bandForced.map((c) => c.id));
  const bandReviews = selectedReviews
    .filter((c) => !bandForcedIds.has(c.id))
    .sort(byDueThenId);
  const bandIntro = [...selectedIntro].sort(byDueThenId);

  const selected = [...bandForced, ...bandReviews, ...bandIntro];
  const dueIds = selected.map((c) => c.id);

  return {
    dueIds,
    selected,
    deferrals,
    meta: {
      introUsed: selectedIntro.length,
      introBudget: prefs.introBudget,
      reviewUsed: selectedReviews.length,
      reviewBudget: prefs.reviewBudget,
      heldIntroCount,
      deferredCount: deferrals.length,
    },
  };
}
