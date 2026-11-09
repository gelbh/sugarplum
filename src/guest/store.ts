import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Grade,
} from "ts-fsrs";
import type {
  CardDraftView,
  CardType,
  Deck,
  JourneyStatus,
  ListDueOpts,
  ListDueResult,
  OcclusionFrontView,
  ReviewResult,
  StrugglingRow,
  StudyRating,
  Subject,
} from "../api/client";
import { assertSingleCloze } from "../lib/clozeFormat";
import { clientLocalDay } from "../study/localDay";
import { type StudyPrefs } from "../study/policyQueue";
import {
  clampStudyPrefs,
  DEFAULT_STUDY_PREFS,
} from "../study/policyPrefs";
import {
  cardFromScheduleRow,
  scheduleColumnsFromCard,
} from "../study/retrievability";
import { GUEST_USER_ID } from "./session";
import {
  buildGuestDueResult,
  buildGuestStruggling,
  type GuestCardSchedule,
  type GuestPolicyInput,
  type GuestReviewLog,
} from "./policyDue";

export type { GuestCardSchedule, GuestReviewLog };

export type GuestHubCardBody = {
  type: "qa" | "cloze" | "mcq";
  front: string;
  back: string;
  options?: string[];
};

type GuestCardPatch = {
  front?: string | OcclusionFrontView;
  back?: string | { answer: string };
  options?: string[];
  type?: CardType;
};

export const GUEST_STORE_KEY = "sugarplum.guest.store.v1";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type GuestStore = {
  subjects: Subject[];
  decks: Deck[];
  cards: CardDraftView[];
  /** Card ids still due for study (order = queue). */
  dueIds: string[];
  studyPrefs: StudyPrefs;
  reviewLogs: GuestReviewLog[];
  schedules: Record<string, GuestCardSchedule>;
  /** Local calendar day → intros already graded that day. */
  introsByDay: Record<string, number>;
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
  studyPrefs?: Partial<StudyPrefs>;
  reviewLogs?: GuestReviewLog[];
  schedules?: Record<string, GuestCardSchedule>;
  introsByDay?: Record<string, number>;
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
    studyPrefs: clampStudyPrefs(raw.studyPrefs ?? {}),
    reviewLogs: Array.isArray(raw.reviewLogs) ? raw.reviewLogs : [],
    schedules:
      raw.schedules && typeof raw.schedules === "object" ? raw.schedules : {},
    introsByDay:
      raw.introsByDay && typeof raw.introsByDay === "object"
        ? raw.introsByDay
        : {},
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

export type GuestListDeckCardsOpts = { status?: "accepted" | "archived" };

/** Hub deck cards, oldest first (default accepted only). */
export function guestListDeckCards(
  deckId: string,
  storage?: Store,
  opts?: GuestListDeckCardsOpts,
): CardDraftView[] {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  const listStatus = opts?.status ?? "accepted";
  return store.cards
    .filter((c) => c.deck_id === deckId && c.status === listStatus)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Mirror worker assertValidMcqOptions for guest hub create. */
function guestAssertValidMcq(
  back: string,
  options: string[] | undefined,
): { back: string; options: string[] } {
  if (options === undefined) {
    throw new Error("MCQ requires options");
  }
  const trimmed = options.map((o) => o.trim());
  if (trimmed.length < 3 || trimmed.length > 5) {
    throw new Error("MCQ must have 3–5 options");
  }
  if (trimmed.some((o) => o.length === 0)) {
    throw new Error("MCQ options must be non-empty");
  }
  const seen = new Set<string>();
  for (const o of trimmed) {
    if (seen.has(o)) {
      throw new Error("MCQ options must be unique");
    }
    seen.add(o);
  }
  const answer = back.trim();
  if (!trimmed.includes(answer)) {
    throw new Error("MCQ back must be one of the options");
  }
  return { back: answer, options: trimmed };
}

/** Create an accepted hub card (qa|cloze|mcq) and prepend to due. */
export function guestCreateDeckCard(
  deckId: string,
  body: GuestHubCardBody,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  const allowed = new Set(["qa", "cloze", "mcq"]);
  if (!allowed.has(body.type)) {
    throw new Error("Unsupported card type");
  }
  const front = body.front.trim();
  if (!front) {
    throw new Error("Front required");
  }
  let back = body.back.trim();
  let options = body.options;
  if (body.type === "cloze") {
    assertSingleCloze(front);
    // Extra (back) may be ""
  } else if (body.type === "mcq") {
    const mcq = guestAssertValidMcq(body.back, body.options);
    back = mcq.back;
    options = mcq.options;
  } else if (body.type === "qa" && !back) {
    throw new Error("Front and back required");
  }
  const created = nowIso();
  const card: CardDraftView = {
    id: `guest-card-${crypto.randomUUID()}`,
    deck_id: deckId,
    job_id: null,
    type: body.type,
    front,
    back,
    ...(body.type === "mcq" && options ? { options } : {}),
    provenance: { guest: true, source: "hub" },
    status: "accepted",
    created_at: created,
    updated_at: created,
    due: created,
  };
  store.cards = [card, ...store.cards];
  store.dueIds = [card.id, ...store.dueIds];
  writeStore(store, storage);
  return card;
}

/** Patch content on an accepted guest card (no schedule change). */
export function guestPatchCard(
  cardId: string,
  body: GuestCardPatch,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted") {
    throw new Error("Only accepted cards can be edited");
  }
  if (
    body.front === undefined &&
    body.back === undefined &&
    body.options === undefined &&
    body.type === undefined
  ) {
    throw new Error("No fields to update");
  }
  const nextType = body.type ?? current.type;
  const nextFront = body.front !== undefined ? body.front : current.front;
  let nextBack = body.back !== undefined ? body.back : current.back;
  let nextOptions =
    body.options !== undefined ? body.options : current.options;

  if (nextType === "cloze" && typeof nextFront === "string") {
    assertSingleCloze(nextFront);
  }
  if (nextType === "mcq") {
    const answer =
      typeof nextBack === "string"
        ? nextBack
        : nextBack &&
            typeof nextBack === "object" &&
            "answer" in nextBack
          ? nextBack.answer
          : "";
    const mcq = guestAssertValidMcq(answer, nextOptions);
    nextBack = mcq.back;
    nextOptions = mcq.options;
  }

  const updated: CardDraftView = {
    ...current,
    type: nextType,
    front: nextFront,
    back: nextBack,
    updated_at: nowIso(),
  };
  if (nextType === "mcq") {
    updated.options = nextOptions;
  } else {
    delete updated.options;
  }
  store.cards[idx] = updated;
  writeStore(store, storage);
  return updated;
}

/** Archive an accepted card; removes it from dueIds. */
export function guestArchiveCard(
  cardId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted") {
    throw new Error("Only accepted cards can be archived");
  }
  const updatedAt = nowIso();
  const updated: CardDraftView = {
    ...current,
    status: "archived",
    updated_at: updatedAt,
  };
  store.cards[idx] = updated;
  store.dueIds = store.dueIds.filter((id) => id !== cardId);
  writeStore(store, storage);
  return updated;
}

/** Delete an accepted card and its local schedule and review logs. */
export function guestDeleteCard(cardId: string, storage?: Store): void {
  const store = readStore(storage);
  const current = store.cards.find((c) => c.id === cardId);
  if (!current) throw new Error("Card not found");
  if (current.status !== "accepted") {
    throw new Error("Only accepted cards can be deleted");
  }
  store.cards = store.cards.filter((c) => c.id !== cardId);
  store.dueIds = store.dueIds.filter((id) => id !== cardId);
  delete store.schedules[cardId];
  store.reviewLogs = store.reviewLogs.filter((l) => l.cardId !== cardId);
  writeStore(store, storage);
}

/** Restore an archived card; prepends id to dueIds. */
export function guestRestoreCard(
  cardId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "archived") {
    throw new Error("Only archived cards can be restored");
  }
  const updatedAt = nowIso();
  const updated: CardDraftView = {
    ...current,
    status: "accepted",
    updated_at: updatedAt,
  };
  store.cards[idx] = updated;
  store.dueIds = [cardId, ...store.dueIds.filter((id) => id !== cardId)];
  writeStore(store, storage);
  return updated;
}

/** Move an accepted or archived card; dueIds unchanged. */
export function guestMoveCard(
  cardId: string,
  deckId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted" && current.status !== "archived") {
    throw new Error("Only accepted or archived cards can be moved");
  }
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  if (deckId === current.deck_id) {
    return current;
  }
  const updatedAt = nowIso();
  const updated: CardDraftView = {
    ...current,
    deck_id: deckId,
    updated_at: updatedAt,
  };
  store.cards[idx] = updated;
  writeStore(store, storage);
  return updated;
}

/** Reset one card's due: due=now and id at front of dueIds. */
export function guestResetCardSchedule(
  cardId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted") {
    throw new Error("Card not found");
  }
  const due = nowIso();
  const updated: CardDraftView = { ...current, due, updated_at: due };
  store.cards[idx] = updated;
  store.dueIds = [cardId, ...store.dueIds.filter((id) => id !== cardId)];
  writeStore(store, storage);
  return updated;
}

export type GuestDueOpts = Pick<
  ListDueOpts,
  "deckId" | "subjectId" | "localDay" | "tzOffsetMinutes" | "introBonus"
>;

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
  if (store.cards.length > 0 && store.dueIds.length === 0) {
    guestResetDue(storage);
    store = readStore(storage);
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

export function guestReviewCard(
  cardId: string,
  rating: StudyRating,
  storage?: Store,
  opts?: { localDay?: string },
): ReviewResult {
  const store = readStore(storage);
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const card = store.cards.find((c) => c.id === cardId);
  if (!card || card.status !== "accepted") {
    throw new Error("Card not found");
  }

  const existing = store.schedules[cardId];
  const wasNew =
    !existing ||
    existing.state === State.New ||
    (existing.reps === 0 && existing.last_review == null);

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
      })
    : createEmptyCard(now);

  const next = scheduleColumnsFromCard(
    fsrs().next(fsrsCard, now, ratingToGrade(rating)).card,
  );

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
  };
  store.cards = store.cards.map((c) =>
    c.id === cardId
      ? { ...c, due: next.due, updated_at: nowIsoValue }
      : c,
  );
  // Keep dueIds cycling for in-session order when still due today.
  if (next.due <= nowIsoValue) {
    store.dueIds = [...store.dueIds.filter((id) => id !== cardId), cardId];
  } else {
    store.dueIds = store.dueIds.filter((id) => id !== cardId);
  }
  store.reviewLogs = [
    ...store.reviewLogs,
    { cardId, rating, at: nowIsoValue },
  ];
  if (wasNew) {
    const day = opts?.localDay ?? clientLocalDay(now);
    store.introsByDay[day] = (store.introsByDay[day] ?? 0) + 1;
  }
  writeStore(store, storage);
  return { due: next.due, state: next.state };
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
