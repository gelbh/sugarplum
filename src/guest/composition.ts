import type { SubjectKnowledge } from "../study/kernel";
import {
  composeSubjectKnowledge,
  type CompositionScheduleInput,
} from "../study/kernel";
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
  avgRetrievability: number | null;
  etk: number;
  recallCardCount: number;
};

function loadStore(storage?: Store) {
  ensureGuestStore(storage);
  const store = peekGuestStore(storage);
  if (!store) throw new Error("Guest store unavailable");
  return store;
}

function compositionRowsForDeckIds(
  store: ReturnType<typeof loadStore>,
  deckIds: Set<string>,
  nowIsoValue: string,
): CompositionScheduleInput[] {
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
  return rows;
}

function summaryFromKnowledge(
  subjectId: string,
  knowledge: SubjectKnowledge,
): SubjectCompositionSummary {
  return {
    subjectId,
    total: knowledge.total,
    graduatedPct: knowledge.graduatedPct,
    new: knowledge.new,
    learning: knowledge.learning,
    young: knowledge.young,
    mature: knowledge.mature,
    avgRetrievability: knowledge.avgRetrievability,
    etk: knowledge.etk,
    recallCardCount: knowledge.recallCardCount,
  };
}

export function guestSubjectCompositionSummaries(
  storage?: Store,
): SubjectCompositionSummary[] {
  const store = loadStore(storage);
  const now = new Date();
  const nowIsoValue = now.toISOString();
  return store.subjects.map((subject) => {
    const deckIds = new Set(
      store.decks.filter((d) => d.subject_id === subject.id).map((d) => d.id),
    );
    const knowledge = composeSubjectKnowledge(
      compositionRowsForDeckIds(store, deckIds, nowIsoValue),
      now,
    );
    return summaryFromKnowledge(subject.id, knowledge);
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
  return composeSubjectKnowledge(
    compositionRowsForDeckIds(store, deckIds, nowIsoValue),
    now,
  );
}

export function guestDeckComposition(
  deckId: string,
  storage?: Store,
): SubjectKnowledge {
  const store = loadStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  const now = new Date();
  const nowIsoValue = now.toISOString();
  return composeSubjectKnowledge(
    compositionRowsForDeckIds(store, new Set([deckId]), nowIsoValue),
    now,
  );
}
