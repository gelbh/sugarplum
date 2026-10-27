import type {
  CardDraftView,
  Deck,
  JourneyStatus,
  ReviewResult,
  StudyRating,
  Subject,
} from "../api/client";
import { GUEST_USER_ID } from "./session";

export const GUEST_STORE_KEY = "sugarplum.guest.store.v1";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type GuestStore = {
  subjects: Subject[];
  decks: Deck[];
  cards: CardDraftView[];
  /** Card ids still due for study (order = queue). */
  dueIds: string[];
};

/** Legacy deck shape before subject hierarchy. */
type LegacyDeck = {
  id: string;
  title: string;
  created_at: string;
  subject_hint?: string | null;
  subject_id?: string;
};

type LegacyGuestStore = {
  subjects?: Subject[];
  decks: LegacyDeck[];
  cards: CardDraftView[];
  dueIds: string[];
};

function backend(storage?: Store): Store {
  return storage ?? localStorage;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withDeckCounts(subjects: Subject[], decks: Deck[]): Subject[] {
  return subjects.map((s) => ({
    ...s,
    deck_count: decks.filter((d) => d.subject_id === s.id).length,
  }));
}

function findOrCreateSubject(
  subjects: Subject[],
  title: string,
  createdAt: string,
): Subject {
  const existing = subjects.find((s) => s.title === title);
  if (existing) return existing;
  const created: Subject = {
    id: `guest-subject-${crypto.randomUUID()}`,
    title,
    created_at: createdAt,
  };
  subjects.push(created);
  return created;
}

/** Migrate stores missing subjects[] / deck.subject_id (one-shot on read). */
function migrateStore(raw: LegacyGuestStore): GuestStore {
  const subjects: Subject[] = Array.isArray(raw.subjects)
    ? raw.subjects.map((s) => ({
        id: s.id,
        title: s.title,
        created_at: s.created_at,
      }))
    : [];

  const decks: Deck[] = (raw.decks ?? []).map((d) => {
    if (d.subject_id && subjects.some((s) => s.id === d.subject_id)) {
      return {
        id: d.id,
        title: d.title,
        subject_id: d.subject_id,
        subject_hint: null,
        created_at: d.created_at,
      };
    }
    const hint =
      typeof d.subject_hint === "string" ? d.subject_hint.trim() : "";
    const title = hint || "Unfiled";
    const subject = findOrCreateSubject(subjects, title, d.created_at);
    return {
      id: d.id,
      title: d.title,
      subject_id: subject.id,
      subject_hint: null,
      created_at: d.created_at,
    };
  });

  return {
    subjects,
    decks,
    cards: raw.cards ?? [],
    dueIds: raw.dueIds ?? [],
  };
}

function seedStore(): GuestStore {
  const subjectId = "guest-subject-anatomy";
  const deckId = "guest-deck-demo";
  const created = nowIso();
  const subjects: Subject[] = [
    {
      id: subjectId,
      title: "Anatomy",
      created_at: created,
    },
  ];
  const decks: Deck[] = [
    {
      id: deckId,
      title: "Guest demo deck",
      subject_id: subjectId,
      subject_hint: null,
      created_at: created,
    },
  ];
  const prompts: Array<{ front: string; back: string }> = [
    {
      front: "Name the three branches of the trigeminal nerve.",
      back: "Ophthalmic, maxillary, mandibular",
    },
    {
      front: "Recall the primary action of the superior oblique muscle.",
      back: "Depresses, abducts, and intorts the eye",
    },
    {
      front: "Which cranial nerve innervates the sternocleidomastoid?",
      back: "Accessory nerve (CN XI)",
    },
    {
      front: "What is the dermatome for the thumb?",
      back: "C6",
    },
  ];
  const cards: CardDraftView[] = prompts.map((p, i) => ({
    id: `guest-card-${i + 1}`,
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front: p.front,
    back: p.back,
    provenance: { guest: true },
    status: "accepted",
    created_at: created,
    updated_at: created,
    due: created,
  }));
  return {
    subjects,
    decks,
    cards,
    dueIds: cards.map((c) => c.id),
  };
}

/** Read guest store without seeding (for merge / snapshot). */
export function peekGuestStore(storage?: Store): GuestStore | null {
  const s = backend(storage);
  try {
    const raw = s.getItem(GUEST_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyGuestStore;
    if (
      !parsed ||
      !Array.isArray(parsed.decks) ||
      !Array.isArray(parsed.cards) ||
      !Array.isArray(parsed.dueIds)
    ) {
      return null;
    }
    const migrated = migrateStore(parsed);
    // Persist migration so subject_id / subjects stick (incl. dangling ids).
    const subjectIds = new Set(
      Array.isArray(parsed.subjects) ? parsed.subjects.map((s) => s.id) : [],
    );
    const needsWrite =
      !Array.isArray(parsed.subjects) ||
      parsed.decks.some(
        (d) => !d.subject_id || !subjectIds.has(d.subject_id),
      );
    if (needsWrite) writeStore(migrated, storage);
    return migrated;
  } catch {
    return null;
  }
}

function readStore(storage?: Store): GuestStore {
  const peeked = peekGuestStore(storage);
  if (peeked) return peeked;
  const seeded = seedStore();
  try {
    writeStore(seeded, storage);
  } catch {
    /* ignore */
  }
  return seeded;
}

function writeStore(store: GuestStore, storage?: Store): void {
  backend(storage).setItem(GUEST_STORE_KEY, JSON.stringify(store));
}

/** Ensure seed exists (call after enterGuest). */
export function ensureGuestStore(storage?: Store): void {
  readStore(storage);
}

export function clearGuestStore(storage?: Store): void {
  try {
    backend(storage).removeItem(GUEST_STORE_KEY);
  } catch {
    /* ignore */
  }
}

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
  writeStore(store, storage);
}

export function guestDeckStats(
  id: string,
  storage?: Store,
): { accepted: number; draft: number; materials: number } {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === id)) {
    throw new Error("Deck not found");
  }
  const cards = store.cards.filter((c) => c.deck_id === id);
  return {
    accepted: cards.filter((c) => c.status === "accepted").length,
    draft: cards.filter((c) => c.status === "draft").length,
    materials: 0,
  };
}

/** Persist paste pairs as accepted cards; prepend ids to the due queue. */
export function guestAddAcceptedCards(
  deckId: string,
  pairs: { front: string; back: string }[],
  storage?: Store,
): CardDraftView[] {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    return [];
  }
  const created = nowIso();
  const cards: CardDraftView[] = pairs.map((p) => ({
    id: `guest-card-${crypto.randomUUID()}`,
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front: p.front,
    back: p.back,
    provenance: { guest: true, source: "paste" },
    status: "accepted",
    created_at: created,
    updated_at: created,
    due: created,
  }));
  store.cards = [...cards, ...store.cards];
  store.dueIds = [...cards.map((c) => c.id), ...store.dueIds];
  writeStore(store, storage);
  return cards;
}

export function guestListDueCards(storage?: Store): CardDraftView[] {
  let store = readStore(storage);
  // Heal emptied queues from older guest builds that dequeued forever.
  if (store.cards.length > 0 && store.dueIds.length === 0) {
    guestResetDue(storage);
    store = readStore(storage);
  }
  const byId = new Map(store.cards.map((c) => [c.id, c]));
  return store.dueIds
    .map((id) => byId.get(id))
    .filter((c): c is CardDraftView => c != null);
}

export function guestReviewCard(
  cardId: string,
  _rating: StudyRating,
  storage?: Store,
): ReviewResult {
  const store = readStore(storage);
  // Guest has no FSRS: cycle the card to the end of the due queue so demo
  // study never empties (signed-in accounts still schedule via the API).
  store.dueIds = [...store.dueIds.filter((id) => id !== cardId), cardId];
  const due = nowIso();
  store.cards = store.cards.map((c) =>
    c.id === cardId ? { ...c, due, updated_at: due } : c,
  );
  writeStore(store, storage);
  return { due };
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
