import type {
  CardDraftView,
  Deck,
  JourneyStatus,
  ReviewResult,
  StudyRating,
} from "../api/client";
import { GUEST_USER_ID } from "./session";

const STORE_KEY = "sugarplum.guest.store.v1";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type GuestStore = {
  decks: Deck[];
  cards: CardDraftView[];
  /** Card ids still due for study (order = queue). */
  dueIds: string[];
};

function backend(storage?: Store): Store {
  return storage ?? localStorage;
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedStore(): GuestStore {
  const deckId = "guest-deck-demo";
  const created = nowIso();
  const decks: Deck[] = [
    {
      id: deckId,
      title: "Guest demo deck",
      subject_hint: "Anatomy",
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
    decks,
    cards,
    dueIds: cards.map((c) => c.id),
  };
}

function readStore(storage?: Store): GuestStore {
  const s = backend(storage);
  try {
    const raw = s.getItem(STORE_KEY);
    if (!raw) {
      const seeded = seedStore();
      writeStore(seeded, storage);
      return seeded;
    }
    const parsed = JSON.parse(raw) as GuestStore;
    if (
      !parsed ||
      !Array.isArray(parsed.decks) ||
      !Array.isArray(parsed.cards) ||
      !Array.isArray(parsed.dueIds)
    ) {
      const seeded = seedStore();
      writeStore(seeded, storage);
      return seeded;
    }
    return parsed;
  } catch {
    const seeded = seedStore();
    try {
      writeStore(seeded, storage);
    } catch {
      /* ignore */
    }
    return seeded;
  }
}

function writeStore(store: GuestStore, storage?: Store): void {
  backend(storage).setItem(STORE_KEY, JSON.stringify(store));
}

/** Ensure seed exists (call after enterGuest). */
export function ensureGuestStore(storage?: Store): void {
  readStore(storage);
}

export function clearGuestStore(storage?: Store): void {
  try {
    backend(storage).removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

export function guestListDecks(storage?: Store): Deck[] {
  return readStore(storage).decks;
}

export function guestCreateDeck(title: string, storage?: Store): Deck {
  const store = readStore(storage);
  const deck: Deck = {
    id: `guest-deck-${crypto.randomUUID()}`,
    title: title.trim() || "Untitled",
    subject_hint: null,
    created_at: nowIso(),
  };
  store.decks = [deck, ...store.decks];
  writeStore(store, storage);
  return deck;
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
