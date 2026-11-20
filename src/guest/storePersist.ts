import type { CardDraftView, Deck, Subject } from "../api/client";
import {
  DEFAULT_GUEST_FSRS_OPTIMIZE,
  normalizeGuestFsrsOptimize,
} from "../study/fsrs/guestFsrsOptimize";
import { clampStudyPrefs, DEFAULT_STUDY_PREFS } from "../study/policyPrefs";
import type {
  GuestStore,
  LegacyGuestStore,
  Store,
} from "./storeTypes";

export const GUEST_STORE_KEY = "sugarplum.guest.store.v1";

/** Serialize guest store mutations across awaits (review / weight save). */
let guestMutationChain: Promise<unknown> = Promise.resolve();

export function enqueueGuestMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = guestMutationChain.then(fn, fn);
  guestMutationChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function backend(storage?: Store): Store {
  return storage ?? localStorage;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function withDeckCounts(subjects: Subject[], decks: Deck[]): Subject[] {
  return subjects.map((s) => ({
    ...s,
    deck_count: decks.filter((d) => d.subject_id === s.id).length,
  }));
}

export function findOrCreateSubject(
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

  const optimize = normalizeGuestFsrsOptimize({
    fsrsW: raw.fsrsW,
    fsrsLastOptimizedAt: raw.fsrsLastOptimizedAt,
    fsrsOptimizePending: raw.fsrsOptimizePending,
  });
  return {
    subjects,
    decks,
    cards: raw.cards ?? [],
    dueIds: raw.dueIds ?? [],
    studyPrefs: clampStudyPrefs(raw.studyPrefs ?? {}),
    reviewLogs: Array.isArray(raw.reviewLogs) ? raw.reviewLogs : [],
    schedules:
      raw.schedules && typeof raw.schedules === "object" ? raw.schedules : {},
    introsByDay:
      raw.introsByDay && typeof raw.introsByDay === "object"
        ? raw.introsByDay
        : {},
    ...optimize,
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
    studyPrefs: { ...DEFAULT_STUDY_PREFS },
    reviewLogs: [],
    schedules: {},
    introsByDay: {},
    ...DEFAULT_GUEST_FSRS_OPTIMIZE,
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
    // Persist migration so subject_id / subjects / prefs stick (incl. dangling ids).
    const subjectIds = new Set(
      Array.isArray(parsed.subjects) ? parsed.subjects.map((s) => s.id) : [],
    );
    const needsWrite =
      !Array.isArray(parsed.subjects) ||
      parsed.decks.some(
        (d) => !d.subject_id || !subjectIds.has(d.subject_id),
      ) ||
      parsed.studyPrefs == null ||
      !Array.isArray(parsed.reviewLogs) ||
      parsed.schedules == null ||
      parsed.introsByDay == null;
    if (needsWrite) writeStore(migrated, storage);
    return migrated;
  } catch {
    return null;
  }
}

export function readStore(storage?: Store): GuestStore {
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

export function writeStore(store: GuestStore, storage?: Store): void {
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
