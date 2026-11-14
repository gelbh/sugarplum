import type { Deck, Subject } from "../api/client";
import {
  nowIso,
  readStore,
  withDeckCounts,
  writeStore,
} from "./storePersist";
import type { Store } from "./storeTypes";

export function guestListSubjects(storage?: Store): Subject[] {
  const store = readStore(storage);
  return withDeckCounts(store.subjects, store.decks);
}

export function guestCreateSubject(title: string, storage?: Store): Subject {
  const store = readStore(storage);
  const subject: Subject = {
    id: `guest-subject-${crypto.randomUUID()}`,
    title: title.trim() || "Untitled",
    created_at: nowIso(),
    deck_count: 0,
  };
  store.subjects = [...store.subjects, subject];
  writeStore(store, storage);
  return subject;
}

export function guestPatchSubject(
  id: string,
  title: string,
  storage?: Store,
): Subject {
  const store = readStore(storage);
  const trimmed = title.trim() || "Untitled";
  const idx = store.subjects.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("Subject not found");
  store.subjects[idx] = { ...store.subjects[idx]!, title: trimmed };
  writeStore(store, storage);
  return withDeckCounts(store.subjects, store.decks)[idx]!;
}

/**
 * Delete subject. Throws Error("Subject still has decks") when any decks remain
 * (API equivalent: 409 `{ error, deck_count }`). Attaches `deck_count` on the error.
 */
export function guestDeleteSubject(id: string, storage?: Store): void {
  const store = readStore(storage);
  if (!store.subjects.some((s) => s.id === id)) {
    throw new Error("Subject not found");
  }
  const deck_count = store.decks.filter((d) => d.subject_id === id).length;
  if (deck_count > 0) {
    const err = new Error("Subject still has decks") as Error & {
      deck_count: number;
    };
    err.deck_count = deck_count;
    throw err;
  }
  store.subjects = store.subjects.filter((s) => s.id !== id);
  writeStore(store, storage);
}

export function guestListDecks(subjectId?: string, storage?: Store): Deck[] {
  const store = readStore(storage);
  if (!subjectId) return store.decks;
  return store.decks.filter((d) => d.subject_id === subjectId);
}

export function guestCreateDeck(
  title: string,
  subjectId: string,
  storage?: Store,
): Deck {
  const store = readStore(storage);
  if (!store.subjects.some((s) => s.id === subjectId)) {
    throw new Error("Subject not found");
  }
  const deck: Deck = {
    id: `guest-deck-${crypto.randomUUID()}`,
    title: title.trim() || "Untitled",
    subject_id: subjectId,
    subject_hint: null,
    created_at: nowIso(),
  };
  store.decks = [deck, ...store.decks];
  writeStore(store, storage);
  return deck;
}

export function guestPatchDeck(
  id: string,
  title: string,
  storage?: Store,
): Deck {
  const store = readStore(storage);
  const idx = store.decks.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error("Deck not found");
  const trimmed = title.trim() || "Untitled";
  store.decks[idx] = { ...store.decks[idx]!, title: trimmed };
  writeStore(store, storage);
  return store.decks[idx]!;
}

export function guestDeleteDeck(id: string, storage?: Store): void {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === id)) {
    throw new Error("Deck not found");
  }
  const removedCardIds = new Set(
    store.cards.filter((c) => c.deck_id === id).map((c) => c.id),
  );
  store.decks = store.decks.filter((d) => d.id !== id);
  store.cards = store.cards.filter((c) => c.deck_id !== id);
  store.dueIds = store.dueIds.filter((cid) => !removedCardIds.has(cid));
  store.reviewLogs = store.reviewLogs.filter(
    (l) => !removedCardIds.has(l.cardId),
  );
  for (const cid of removedCardIds) {
    delete store.schedules[cid];
  }
  writeStore(store, storage);
}

export function guestDeckStats(
  id: string,
  storage?: Store,
): { accepted: number; draft: number; archived: number; materials: number } {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === id)) {
    throw new Error("Deck not found");
  }
  const cards = store.cards.filter((c) => c.deck_id === id);
  return {
    accepted: cards.filter((c) => c.status === "accepted").length,
    draft: cards.filter((c) => c.status === "draft").length,
    archived: cards.filter((c) => c.status === "archived").length,
    materials: 0,
  };
}
