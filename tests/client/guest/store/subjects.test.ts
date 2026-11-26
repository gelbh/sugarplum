import { beforeEach, describe, expect, it, vi } from "vitest";
import { enterGuest, GUEST_FLAG_KEY } from "../../../../src/guest/session";
import {
  guestAddAcceptedCards,
  guestCreateDeck,
  guestCreateSubject,
  guestDeleteSubject,
  guestListDecks,
  guestListDueCards,
  guestListSubjects,
} from "../../../../src/guest/store";
import {
  guestDeckComposition,
  guestSubjectComposition,
  guestSubjectCompositionSummaries,
} from "../../../../src/guest/composition";
import { cardDueIso } from "../../../../src/guest/policyDue";
import {
  cardFromScheduleRow,
  retrievability,
} from "../../../../src/study/fsrs/retrievability";
import { aggregateSubjectRecall } from "../../../../src/study/queue/subjectRecall";
import { installGuestStoreTestEnv, STORE_KEY, COMPOSITION_NOW } from "./setup";

describe("guest store", () => {
  let storage: ReturnType<typeof installGuestStoreTestEnv>["storage"];

  beforeEach(() => {
    ({ storage } = installGuestStoreTestEnv());
  });

  it("seeds due cards after enterGuest + list", async () => {
    enterGuest(storage);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    const { cards: due, meta } = guestListDueCards(undefined, storage);
    expect(due.length).toBeGreaterThan(0);
    expect(due[0]?.front.length).toBeGreaterThan(0);
    expect(meta.introBudget).toBe(20);
    expect(meta.reviewBudget).toBe(200);
  });

  it("seeds Anatomy subject and attaches demo deck subject_id", async () => {
    enterGuest(storage);
    const subjects = guestListSubjects(storage);
    expect(subjects.some((s) => s.title === "Anatomy")).toBe(true);
    const anatomy = subjects.find((s) => s.title === "Anatomy")!;
    const decks = guestListDecks(undefined, storage);
    expect(decks.length).toBeGreaterThan(0);
    expect(decks.every((d) => d.subject_id === anatomy.id)).toBe(true);
  });

  it("guestSubjectComposition aggregates accepted buckets and ignores drafts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(COMPOSITION_NOW);
    try {
      const subject = guestCreateSubject("Knowledge subject", storage);
      const deck = guestCreateDeck("Knowledge deck", subject.id, storage);
      const [, cLearn, cYoung, cMature, cDraft] = guestAddAcceptedCards(
        deck.id,
        [
          { front: "New?", back: "n" },
          { front: "Learn?", back: "l" },
          { front: "Young?", back: "y" },
          { front: "Mature?", back: "m" },
          { front: "Draft?", back: "d" },
        ],
        storage,
      );
      const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
        cards: Array<{ id: string; status: string; due?: string }>;
        schedules: Record<string, unknown>;
      };
      const draftIdx = raw.cards.findIndex((c) => c.id === cDraft!.id);
      raw.cards[draftIdx] = { ...raw.cards[draftIdx]!, status: "draft" };
      // Leave cNew without a schedule → New.
      raw.schedules[cLearn!.id] = {
        state: 1,
        reps: 1,
        lapses: 0,
        stability: 0.1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 0,
        learning_steps: 0,
        last_review: "2026-01-01T12:00:00.000Z",
      };
      raw.schedules[cYoung!.id] = {
        state: 2,
        reps: 3,
        lapses: 0,
        stability: 20,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 20,
        learning_steps: 0,
        last_review: "2026-01-01T12:00:00.000Z",
      };
      raw.schedules[cMature!.id] = {
        state: 2,
        reps: 5,
        lapses: 0,
        stability: 30,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 21,
        learning_steps: 0,
        last_review: "2026-01-01T12:00:00.000Z",
      };
      storage.setItem(STORE_KEY, JSON.stringify(raw));

      const nowIsoValue = COMPOSITION_NOW.toISOString();
      const cardById = new Map(raw.cards.map((c) => [c.id, c]));
      const rFor = (id: string, sched: Record<string, unknown>) => {
        const card = cardById.get(id)!;
        return retrievability(
          cardFromScheduleRow({
            due: cardDueIso(card as { due?: string }, nowIsoValue),
            stability: sched.stability as number,
            difficulty: sched.difficulty as number,
            elapsed_days: sched.elapsed_days as number,
            scheduled_days: sched.scheduled_days as number,
            learning_steps: sched.learning_steps as number,
            reps: sched.reps as number,
            lapses: sched.lapses as number,
            state: sched.state as number,
            last_review: sched.last_review as string,
          }),
          COMPOSITION_NOW,
        );
      };
      const recall = aggregateSubjectRecall([
        null,
        rFor(cLearn!.id, raw.schedules[cLearn!.id] as Record<string, unknown>),
        rFor(cYoung!.id, raw.schedules[cYoung!.id] as Record<string, unknown>),
        rFor(
          cMature!.id,
          raw.schedules[cMature!.id] as Record<string, unknown>,
        ),
      ]);

      expect(guestSubjectComposition(subject.id, storage)).toEqual({
        new: 1,
        learning: 1,
        young: 1,
        mature: 1,
        total: 4,
        graduated: 2,
        graduatedPct: 50,
        avgRetrievability: recall.avgRetrievability,
        etk: recall.etk,
        recallCardCount: recall.recallCardCount,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("guestSubjectComposition all-new → avg 0 and 0 etk", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(COMPOSITION_NOW);
    try {
      const subject = guestCreateSubject("New only", storage);
      const deck = guestCreateDeck("New deck", subject.id, storage);
      guestAddAcceptedCards(
        deck.id,
        [
          { front: "A?", back: "a" },
          { front: "B?", back: "b" },
        ],
        storage,
      );
      expect(guestSubjectComposition(subject.id, storage)).toEqual({
        new: 2,
        learning: 0,
        young: 0,
        mature: 0,
        total: 2,
        graduated: 0,
        graduatedPct: 0,
        avgRetrievability: 0,
        etk: 0,
        recallCardCount: 2,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("guestSubjectComposition throws for missing subject", async () => {
    expect(() => guestSubjectComposition("missing", storage)).toThrow(
      "Subject not found",
    );
  });

  it("guestDeckComposition matches subject buckets for a single deck", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(COMPOSITION_NOW);
    try {
      const subject = guestCreateSubject("Deck knowledge", storage);
      const deck = guestCreateDeck("Only deck", subject.id, storage);
      const [, cYoung] = guestAddAcceptedCards(
        deck.id,
        [
          { front: "New?", back: "n" },
          { front: "Young?", back: "y" },
        ],
        storage,
      );
      const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
        schedules: Record<string, unknown>;
      };
      raw.schedules[cYoung!.id] = {
        state: 2,
        reps: 3,
        lapses: 0,
        stability: 20,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 20,
        learning_steps: 0,
        last_review: "2026-01-01T12:00:00.000Z",
      };
      storage.setItem(STORE_KEY, JSON.stringify(raw));

      const out = guestDeckComposition(deck.id, storage);
      expect(out).toMatchObject({
        new: 1,
        young: 1,
        total: 2,
        graduatedPct: 50,
        recallCardCount: 2,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("guestSubjectCompositionSummaries returns graduated pct per subject", async () => {
    const empty = guestCreateSubject("Empty", storage);
    const subject = guestCreateSubject("Knowledge subject", storage);
    const deck = guestCreateDeck("Knowledge deck", subject.id, storage);
    const [, cYoung] = guestAddAcceptedCards(
      deck.id,
      [
        { front: "New?", back: "n" },
        { front: "Young?", back: "y" },
      ],
      storage,
    );
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      schedules: Record<string, unknown>;
    };
    raw.schedules[cYoung!.id] = {
      state: 2,
      reps: 3,
      lapses: 0,
      stability: 20,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 20,
      learning_steps: 0,
      last_review: "2026-01-01T12:00:00.000Z",
    };
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    const summaries = guestSubjectCompositionSummaries(storage);
    expect(summaries).toEqual(
      expect.arrayContaining([
        {
          subjectId: empty.id,
          total: 0,
          graduatedPct: null,
          new: 0,
          learning: 0,
          young: 0,
          mature: 0,
          avgRetrievability: null,
          etk: 0,
          recallCardCount: 0,
        },
        expect.objectContaining({
          subjectId: subject.id,
          total: 2,
          graduatedPct: 50,
          new: 1,
          learning: 0,
          young: 1,
          mature: 0,
          recallCardCount: 2,
        }),
      ]),
    );
    const mixed = summaries.find((s) => s.subjectId === subject.id)!;
    expect(mixed.avgRetrievability).not.toBeNull();
    expect(mixed.etk).toBeGreaterThanOrEqual(0);
  });

  it("migrates old store without subjects into Unfiled / subject_hint", async () => {
    storage.setItem(
      STORE_KEY,
      JSON.stringify({
        decks: [
          {
            id: "legacy-deck-1",
            title: "Bones",
            subject_hint: "Anatomy",
            created_at: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "legacy-deck-2",
            title: "Loose notes",
            subject_hint: null,
            created_at: "2024-01-02T00:00:00.000Z",
          },
        ],
        cards: [],
        dueIds: [],
      }),
    );

    const subjects = guestListSubjects(storage);
    expect(subjects.map((s) => s.title).sort()).toEqual(["Anatomy", "Unfiled"]);
    const byTitle = Object.fromEntries(subjects.map((s) => [s.title, s.id]));
    const decks = guestListDecks(undefined, storage);
    expect(decks.find((d) => d.id === "legacy-deck-1")?.subject_id).toBe(
      byTitle.Anatomy,
    );
    expect(decks.find((d) => d.id === "legacy-deck-2")?.subject_id).toBe(
      byTitle.Unfiled,
    );
  });

  it("persists remap when deck.subject_id is dangling", async () => {
    storage.setItem(
      STORE_KEY,
      JSON.stringify({
        subjects: [
          {
            id: "sub-keep",
            title: "Kept",
            created_at: "2024-01-01T00:00:00.000Z",
          },
        ],
        decks: [
          {
            id: "deck-orphan",
            title: "Orphan",
            subject_id: "sub-missing",
            subject_hint: "Anatomy",
            created_at: "2024-01-02T00:00:00.000Z",
          },
        ],
        cards: [],
        dueIds: [],
      }),
    );

    const decks = guestListDecks(undefined, storage);
    expect(decks[0]?.subject_id).not.toBe("sub-missing");
    const persisted = JSON.parse(storage.getItem(STORE_KEY)!) as {
      decks: Array<{ subject_id: string }>;
      subjects: Array<{ id: string; title: string }>;
    };
    expect(persisted.decks[0]?.subject_id).toBe(decks[0]?.subject_id);
    expect(persisted.subjects.some((s) => s.title === "Anatomy")).toBe(true);
  });

  it("creates subject then deck under subject_id", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Physiology", storage);
    expect(subject.title).toBe("Physiology");
    expect(subject.deck_count).toBe(0);

    const deck = guestCreateDeck("Cardiac", subject.id, storage);
    expect(deck.subject_id).toBe(subject.id);
    expect(deck.title).toBe("Cardiac");

    const listed = guestListSubjects(storage).find((s) => s.id === subject.id);
    expect(listed?.deck_count).toBe(1);
    expect(guestListDecks(subject.id, storage)).toHaveLength(1);
  });

  it("deleteSubject throws when decks remain; empty subject deletes", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Emptyable", storage);
    const withDecks = guestCreateSubject("Busy", storage);
    guestCreateDeck("Keep me", withDecks.id, storage);

    expect(() => guestDeleteSubject(withDecks.id, storage)).toThrow(
      /Subject still has decks/,
    );
    expect(guestListSubjects(storage).some((s) => s.id === withDecks.id)).toBe(
      true,
    );

    guestDeleteSubject(subject.id, storage);
    expect(guestListSubjects(storage).some((s) => s.id === subject.id)).toBe(
      false,
    );
  });
});
