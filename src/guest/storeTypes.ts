import type {
  CardDraftView,
  CardType,
  Deck,
  ListDueOpts,
  OcclusionFrontView,
  Subject,
} from "../api/client";
import type { StudyPrefs } from "../study/kernel";
import type { GuestFsrsOptimizeFields } from "../study/fsrs/guestFsrsOptimize";
import type {
  GuestCardSchedule,
  GuestReviewLog,
} from "./policyDue";

export type { GuestCardSchedule, GuestReviewLog };

export type GuestHubCardBody = {
  type: "qa" | "cloze" | "mcq";
  front: string;
  back: string;
  options?: string[];
};

export type GuestCardPatch = {
  front?: string | OcclusionFrontView;
  back?: string | { answer: string };
  options?: string[];
  type?: CardType;
  provenance_pages?: number[];
};

export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type GuestStore = {
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
} & GuestFsrsOptimizeFields;

/** Legacy deck shape before subject hierarchy. */
export type LegacyDeck = {
  id: string;
  title: string;
  created_at: string;
  subject_hint?: string | null;
  subject_id?: string;
};

export type LegacyGuestStore = {
  subjects?: Subject[];
  decks: LegacyDeck[];
  cards: CardDraftView[];
  dueIds: string[];
  studyPrefs?: Partial<StudyPrefs>;
  reviewLogs?: GuestReviewLog[];
  schedules?: Record<string, GuestCardSchedule>;
  introsByDay?: Record<string, number>;
  fsrsW?: number[] | null;
  fsrsLastOptimizedAt?: string | null;
  fsrsOptimizePending?: boolean;
};

export type GuestListDeckCardsOpts = { status?: "accepted" | "archived" };

export type GuestDueOpts = Pick<
  ListDueOpts,
  "deckId" | "subjectId" | "localDay" | "tzOffsetMinutes" | "introBonus"
>;
