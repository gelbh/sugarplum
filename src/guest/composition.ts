import type { SubjectKnowledge } from "../study/subjectKnowledge";
import {
  aggregateSubjectKnowledge,
  composeSubjectKnowledge,
  type CompositionScheduleInput,
} from "../study/subjectKnowledge";
import { cardDueIso } from "./policyDue";
import { ensureGuestStore, peekGuestStore } from "./store";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SubjectCompositionSummary = {
  subjectId: string;
  total: number;
  graduatedPct: number | null;
  new: number;
  learning: number;
  young: number;
  mature: number;
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
      new: agg.new,
      learning: agg.learning,
      young: agg.young,
      mature: agg.mature,
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
  const rows: CompositionScheduleInput[] = [];
  for (const card of store.cards) {
    if (!deckIds.has(card.deck_id) || card.status !== "accepted") continue;
    const sched = store.schedules[card.id];
    if (!sched) {
      rows.push({
        state: null,
        scheduled_days: null,
        due: null,
        stability: null,
        difficulty: null,
        elapsed_days: null,
        learning_steps: null,
        reps: null,
        lapses: null,
        last_review: null,
      });
      continue;
    }
    rows.push({
      state: sched.state,
      scheduled_days: sched.scheduled_days,
      due: cardDueIso(card, nowIsoValue),
      stability: sched.stability,
      difficulty: sched.difficulty,
      elapsed_days: sched.elapsed_days,
      learning_steps: sched.learning_steps,
      reps: sched.reps,
      lapses: sched.lapses,
      last_review: sched.last_review,
    });
  }
  return composeSubjectKnowledge(rows, now);
}
