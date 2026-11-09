import type { SubjectKnowledge } from "../study/subjectKnowledge";
import { aggregateSubjectKnowledge } from "../study/subjectKnowledge";
import { aggregateSubjectRecall } from "../study/subjectRecall";
import {
  cardFromScheduleRow,
  retrievability,
} from "../study/retrievability";
import { cardDueIso } from "./policyDue";
import { ensureGuestStore, peekGuestStore } from "./store";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SubjectCompositionSummary = {
  subjectId: string;
  total: number;
  graduatedPct: number | null;
};

function loadStore(storage?: Store) {
  ensureGuestStore(storage);
  const store = peekGuestStore(storage);
  if (!store) throw new Error("Guest store unavailable");
  return store;
}

export function guestSubjectCompositionSummaries(
  storage?: Store,
): SubjectCompositionSummary[] {
  const store = loadStore(storage);
  return store.subjects.map((subject) => {
    const deckIds = new Set(
      store.decks.filter((d) => d.subject_id === subject.id).map((d) => d.id),
    );
    const rows = store.cards
      .filter((c) => deckIds.has(c.deck_id) && c.status === "accepted")
      .map((c) => {
        const sched = store.schedules[c.id];
        if (!sched) return { state: null, scheduled_days: null };
        return { state: sched.state, scheduled_days: sched.scheduled_days };
      });
    const agg = aggregateSubjectKnowledge(rows);
    return {
      subjectId: subject.id,
      total: agg.total,
      graduatedPct: agg.graduatedPct,
    };
  });
}

export function guestSubjectComposition(
  subjectId: string,
  storage?: Store,
): SubjectKnowledge {
  const store = loadStore(storage);
  if (!store.subjects.some((s) => s.id === subjectId)) {
    throw new Error("Subject not found");
  }
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const deckIds = new Set(
    store.decks.filter((d) => d.subject_id === subjectId).map((d) => d.id),
  );
  const bucketRows: Array<{
    state: number | null;
    scheduled_days: number | null;
  }> = [];
  const rValues: Array<number | null> = [];
  for (const card of store.cards) {
    if (!deckIds.has(card.deck_id) || card.status !== "accepted") continue;
    const sched = store.schedules[card.id];
    if (!sched) {
      bucketRows.push({ state: null, scheduled_days: null });
      rValues.push(null);
      continue;
    }
    bucketRows.push({
      state: sched.state,
      scheduled_days: sched.scheduled_days,
    });
    try {
      rValues.push(
        retrievability(
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
        ),
      );
    } catch {
      rValues.push(null);
    }
  }
  return {
    ...aggregateSubjectKnowledge(bucketRows),
    ...aggregateSubjectRecall(rValues),
  };
}
