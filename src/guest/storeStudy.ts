import { Rating, State, type Grade } from "ts-fsrs";
import type {
  JourneyStatus,
  ListDueResult,
  ReviewResult,
  StrugglingRow,
  StudyRating,
} from "../api/client";
import { replayMemoryFromLogs } from "../study/fsrsCutover";
import { schedulerForPrefs } from "../study/fsrsFactory";
import {
  buildGuestFsrsPrefs,
  guestFsrsOptimizeStatus,
  guestRevlogCsv,
  nextGuestFsrsPending,
} from "../study/guestFsrsOptimize";
import { rescheduleGuestSchedules } from "../study/guestFsrsReschedule";
import { normalizeSchedulerCard } from "../study/fsrsReplay";
import { buildDueHistogramFromDues } from "../study/dueHistogram";
import { applyLoadBalance } from "../study/loadBalance";
import { clientLocalDay, resolveLocalDayStartIso } from "../study/localDay";
import { type StudyPrefs } from "../study/policyQueue";
import { clampStudyPrefs } from "../study/policyPrefs";
import type { FsrsOptimizeStatus } from "../study/fsrsOptimizeTypes";
import type { RescheduleSummary } from "../study/fsrsReplay";
import { validateFsrsW } from "../study/fsrsWeights";
import {
  cardFromScheduleRow,
  emptyFsrsCard,
  scheduleColumnsFromCard,
} from "../study/retrievability";
import { GUEST_USER_ID } from "./session";
import {
  buildGuestDueResult,
  buildGuestStruggling,
  type GuestPolicyInput,
} from "./policyDue";
import {
  enqueueGuestMutation,
  readStore,
  writeStore,
} from "./storePersist";
import type { GuestDueOpts, GuestStore, Store } from "./storeTypes";

export function guestGetStudyPrefs(storage?: Store): StudyPrefs {
  return { ...readStore(storage).studyPrefs };
}

export function guestPutStudyPrefs(
  prefs: Partial<StudyPrefs>,
  storage?: Store,
): StudyPrefs {
  const store = readStore(storage);
  const clamped = clampStudyPrefs(prefs, store.studyPrefs);
  store.studyPrefs = clamped;
  writeStore(store, storage);
  return { ...clamped };
}

export function guestGetFsrsOptimizeStatus(
  storage?: Store,
): FsrsOptimizeStatus {
  const store = readStore(storage);
  return guestFsrsOptimizeStatus(store.reviewLogs, {
    fsrsW: store.fsrsW,
    fsrsLastOptimizedAt: store.fsrsLastOptimizedAt,
    fsrsOptimizePending: store.fsrsOptimizePending,
  });
}

export function guestMarkFsrsOptimizePendingIfDue(
  storage?: Store,
  now: Date = new Date(),
): FsrsOptimizeStatus {
  const store = readStore(storage);
  const pending = nextGuestFsrsPending(
    store.reviewLogs,
    {
      fsrsW: store.fsrsW,
      fsrsLastOptimizedAt: store.fsrsLastOptimizedAt,
      fsrsOptimizePending: store.fsrsOptimizePending,
    },
    now,
  );
  if (pending !== store.fsrsOptimizePending) {
    store.fsrsOptimizePending = pending;
    writeStore(store, storage);
  }
  return guestFsrsOptimizeStatus(store.reviewLogs, {
    fsrsW: store.fsrsW,
    fsrsLastOptimizedAt: store.fsrsLastOptimizedAt,
    fsrsOptimizePending: store.fsrsOptimizePending,
  });
}

export function guestGetFsrsRevlogCsv(storage?: Store): string {
  return guestRevlogCsv(readStore(storage).reviewLogs);
}

async function applyGuestReschedule(
  store: GuestStore,
  now: Date,
): Promise<RescheduleSummary> {
  const result = await rescheduleGuestSchedules({
    cards: store.cards,
    schedules: store.schedules,
    reviewLogs: store.reviewLogs,
    prefs: buildGuestFsrsPrefs(store.studyPrefs, store.fsrsW),
    now,
  });
  store.cards = result.cards;
  store.schedules = result.schedules;
  store.dueIds = result.dueIds;
  return result.summary;
}

/** Persist optimize meta, then reschedule; keep meta if reschedule throws. */
async function persistGuestFsrsWeightsAndReschedule(
  store: GuestStore,
  storage: Store | undefined,
  now: Date,
): Promise<RescheduleSummary> {
  let rescheduled: RescheduleSummary = { cardsUpdated: 0, cardsSkipped: 0 };
  let rescheduleError: unknown = null;
  try {
    rescheduled = await applyGuestReschedule(store, now);
  } catch (err) {
    rescheduleError = err;
  }
  writeStore(store, storage);
  if (rescheduleError) throw rescheduleError;
  return rescheduled;
}

export async function guestSaveFsrsWeights(
  w: number[],
  storage?: Store,
  now: Date = new Date(),
): Promise<{ ok: true; wLength: number; rescheduled: RescheduleSummary }> {
  return enqueueGuestMutation(async () => {
    const validated = validateFsrsW(w);
    if (!validated) throw new Error("Invalid FSRS weights");
    const store = readStore(storage);
    store.fsrsW = validated;
    store.fsrsLastOptimizedAt = now.toISOString();
    store.fsrsOptimizePending = false;
    const rescheduled = await persistGuestFsrsWeightsAndReschedule(
      store,
      storage,
      now,
    );
    return { ok: true, wLength: validated.length, rescheduled };
  });
}

export async function guestResetFsrsWeights(
  storage?: Store,
  now: Date = new Date(),
): Promise<{ ok: true; rescheduled: RescheduleSummary }> {
  return enqueueGuestMutation(async () => {
    const store = readStore(storage);
    store.fsrsW = null;
    store.fsrsLastOptimizedAt = now.toISOString();
    store.fsrsOptimizePending = false;
    const rescheduled = await persistGuestFsrsWeightsAndReschedule(
      store,
      storage,
      now,
    );
    return { ok: true, rescheduled };
  });
}

function policyInput(store: GuestStore): GuestPolicyInput {
  return {
    cards: store.cards,
    decks: store.decks,
    schedules: store.schedules,
    studyPrefs: store.studyPrefs,
    reviewLogs: store.reviewLogs,
    introsByDay: store.introsByDay,
  };
}

export function guestListDueCards(
  opts?: GuestDueOpts,
  storage?: Store,
): ListDueResult {
  let store = readStore(storage);
  // Heal emptied queues from older guest builds that dequeued forever.
  // Only when something is actually due; empty after reschedule-to-future is valid.
  if (store.cards.length > 0 && store.dueIds.length === 0) {
    const nowIso = new Date().toISOString();
    const anyDue = store.cards.some(
      (c) =>
        c.status === "accepted" &&
        typeof c.due === "string" &&
        c.due.length > 0 &&
        c.due <= nowIso,
    );
    if (anyDue) {
      guestResetDue(storage);
      store = readStore(storage);
    }
  }

  const { result, pendingDeferrals } = buildGuestDueResult(
    policyInput(store),
    opts,
  );
  // Peek only: do not persist deferrals (commit-pacing path does).
  if (!opts?.deckId && !opts?.subjectId) {
    store.dueIds = result.cards.map((c) => c.id);
    writeStore(store, storage);
  }
  return { ...result, pendingDeferrals };
}

/** Apply R-aware deferrals (guest analogue of POST /commit-pacing). */
export function guestCommitPacing(
  opts?: GuestDueOpts,
  storage?: Store,
): { deferredCount: number } {
  const store = readStore(storage);
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const { pendingDeferrals } = buildGuestDueResult(
    policyInput(store),
    opts,
    now,
  );
  if (pendingDeferrals.length === 0) {
    return { deferredCount: 0 };
  }
  const deferById = new Map(pendingDeferrals.map((d) => [d.id, d.newDue]));
  store.cards = store.cards.map((c) => {
    const newDue = deferById.get(c.id);
    if (!newDue) return c;
    return { ...c, due: newDue, updated_at: nowIsoValue };
  });
  writeStore(store, storage);
  return { deferredCount: pendingDeferrals.length };
}

export function guestListStrugglingCards(storage?: Store): StrugglingRow[] {
  return buildGuestStruggling(policyInput(readStore(storage)));
}

function ratingToGrade(rating: StudyRating): Grade {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
    default: {
      const _exhaustive: never = rating;
      return _exhaustive;
    }
  }
}

export async function guestReviewCard(
  cardId: string,
  rating: StudyRating,
  storage?: Store,
  opts?: { localDay?: string },
): Promise<ReviewResult> {
  return enqueueGuestMutation(async () => {
    const prefsSnap = readStore(storage);
    const prefs = buildGuestFsrsPrefs(prefsSnap.studyPrefs, prefsSnap.fsrsW);
    const scheduler = await schedulerForPrefs(prefs);
    const store = readStore(storage);
    const now = new Date();
    const nowIsoValue = now.toISOString();
    const card = store.cards.find((c) => c.id === cardId);
    if (!card || card.status !== "accepted") {
      throw new Error("Card not found");
    }

    let existing = store.schedules[cardId];
    const wasNew =
      !existing ||
      existing.state === State.New ||
      (existing.reps === 0 && existing.last_review == null);

    if (existing && !wasNew) {
      const fast = existing.stability_fast;
      const hasFast =
        fast != null && Number.isFinite(fast) && fast > 0;
      if (!hasFast) {
        const logs = store.reviewLogs
          .filter((l) => l.cardId === cardId)
          .map((l) => ({ reviewed_at: l.at, rating: l.rating }));
        const memory = await replayMemoryFromLogs(logs, {
          ...prefs,
          enableFuzz: false,
          modelVersion: "FSRS-7",
        });
        if (memory) {
          existing = {
            ...existing,
            stability: memory.stability,
            difficulty: memory.difficulty,
            stability_fast: memory.stabilityFast,
          };
          store.schedules[cardId] = existing;
        }
      }
    }

    const fsrsCard = existing
      ? cardFromScheduleRow({
          due: typeof card.due === "string" ? card.due : nowIsoValue,
          stability: existing.stability,
          difficulty: existing.difficulty,
          elapsed_days: existing.elapsed_days,
          scheduled_days: existing.scheduled_days,
          learning_steps: existing.learning_steps,
          reps: existing.reps,
          lapses: existing.lapses,
          state: existing.state,
          last_review: existing.last_review,
          stability_fast: existing.stability_fast,
          card_id: cardId,
        })
      : emptyFsrsCard(now, cardId);

    const studyPrefs = prefsSnap.studyPrefs;
    const useLoadBalance =
      studyPrefs.enableLoadBalance && studyPrefs.enableFuzz;
    const gradeScheduler = useLoadBalance
      ? await schedulerForPrefs({ ...prefs, enableFuzz: false })
      : scheduler;

    const { card: rawNext, revlog: log } = gradeScheduler.review({
      card: fsrsCard as never,
      grade: ratingToGrade(rating),
      now,
    });
    let nextCard = normalizeSchedulerCard(rawNext);

    if (useLoadBalance) {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const dues = store.cards
        .filter((c) => c.status === "accepted" && typeof c.due === "string")
        .map((c) => c.due as string);
      const { dueCntPerDay, dueToday } = buildDueHistogramFromDues(
        dues,
        now,
        tzOffsetMinutes,
      );
      const dayStart = resolveLocalDayStartIso(now, {
        localDay: opts?.localDay,
        tzOffsetMinutes,
      });
      const dayEndMs = new Date(dayStart).getTime() + 86_400_000;
      const reviewedToday = store.reviewLogs.filter((l) => {
        const t = new Date(l.at).getTime();
        return t >= new Date(dayStart).getTime() && t < dayEndMs;
      }).length;
      nextCard = applyLoadBalance(nextCard, {
        enableLoadBalance: true,
        enableFuzz: true,
        easyDays: studyPrefs.easyDays,
        now,
        tzOffsetMinutes,
        dueCntPerDay,
        dueToday,
        reviewedToday,
      });
    }

    const next = scheduleColumnsFromCard(nextCard);

    store.schedules[cardId] = {
      state: next.state,
      reps: next.reps,
      lapses: next.lapses,
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsed_days,
      scheduled_days: next.scheduled_days,
      learning_steps: next.learning_steps,
      last_review: next.last_review,
      stability_fast: next.stability_fast,
    };
    store.cards = store.cards.map((c) =>
      c.id === cardId ? { ...c, due: next.due, updated_at: nowIsoValue } : c,
    );
    // Keep dueIds cycling for in-session order when still due today.
    if (next.due <= nowIsoValue) {
      store.dueIds = [...store.dueIds.filter((id) => id !== cardId), cardId];
    } else {
      store.dueIds = store.dueIds.filter((id) => id !== cardId);
    }
    store.reviewLogs = [
      ...store.reviewLogs,
      { cardId, rating, at: nowIsoValue, state: log.state },
    ];
    if (wasNew) {
      const day = opts?.localDay ?? clientLocalDay(now);
      store.introsByDay[day] = (store.introsByDay[day] ?? 0) + 1;
    }
    writeStore(store, storage);
    return { due: next.due, state: next.state };
  });
}

/** Put every guest card back in the due queue (manual restudy). */
export function guestResetDue(storage?: Store): void {
  const store = readStore(storage);
  store.dueIds = store.cards.map((c) => c.id);
  writeStore(store, storage);
}

export function guestJourney(storage?: Store): JourneyStatus {
  const store = readStore(storage);
  return {
    deckCount: store.decks.length,
    hasGenerationJob: false,
    openReviewJobId: null,
    pendingGenerationJobId: null,
    acceptedCount: store.cards.length,
    dueCount: store.dueIds.length,
  };
}

export function guestUserId(): string {
  return GUEST_USER_ID;
}
