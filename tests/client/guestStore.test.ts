import { beforeEach, describe, expect, it, vi } from "vitest";
import { endGuestLocal } from "../../src/guest/endGuestLocal";
import { enterGuest, GUEST_FLAG_KEY, isGuest } from "../../src/guest/session";
import {
  clearGuestStore,
  guestAddAcceptedCards,
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestDeleteSubject,
  guestGetStudyPrefs,
  guestListDeckCards,
  guestListDecks,
  guestListDueCards,
  guestListStrugglingCards,
  guestListSubjects,
  guestArchiveCard,
  guestDeleteCard,
  guestMoveCard,
  guestPatchCard,
  guestGetFsrsOptimizeStatus,
  guestPutStudyPrefs,
  guestResetCardSchedule,
  guestResetFsrsWeights,
  guestRestoreCard,
  guestReviewCard,
  guestSaveFsrsWeights,
} from "../../src/guest/store";
import {
  guestDeckComposition,
  guestSubjectComposition,
  guestSubjectCompositionSummaries,
} from "../../src/guest/composition";
import { cardDueIso } from "../../src/guest/policyDue";
import {
  cardFromScheduleRow,
  retrievability,
} from "../../src/study/fsrs/retrievability";
import { aggregateSubjectRecall } from "../../src/study/session/subjectRecall";

const COMPOSITION_NOW = new Date("2026-11-01T12:00:00.000Z");

const STORE_KEY = "sugarplum.guest.store.v1";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

describe("guest store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    clearGuestStore(storage);
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

  it("writes FSRS schedule on grade (leaves New state)", async () => {
    enterGuest(storage);
    const due = guestListDueCards(undefined, storage).cards;
    const id = due[0]!.id;
    const result = await guestReviewCard(id, 3, storage);
    expect(result.due).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof result.state).toBe("number");
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      schedules: Record<string, { state: number; reps: number }>;
      reviewLogs: Array<{
        cardId: string;
        rating: number;
        at: string;
        state?: number;
      }>;
    };
    expect(raw.schedules[id]?.reps).toBeGreaterThan(0);
    expect(raw.schedules[id]?.state).not.toBe(0); // not State.New
    const graded = raw.reviewLogs.find(
      (l) => l.cardId === id && l.rating === 3,
    );
    expect(graded).toBeDefined();
    expect(graded?.state).toBe(0);
  });

  it("keeps thin historical logs and enriches only new grades", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Thin logs subject", storage);
    const deck = guestCreateDeck("Thin logs deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Thin?", back: "Yes" },
      storage,
    );
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      reviewLogs: Array<{
        cardId: string;
        rating: number;
        at: string;
        state?: number;
      }>;
    };
    const thinAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    raw.reviewLogs.push({
      cardId: card.id,
      rating: 1,
      at: thinAt,
    });
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    await guestReviewCard(card.id, 3, storage);

    const after = JSON.parse(storage.getItem(STORE_KEY)!) as {
      reviewLogs: Array<{
        cardId: string;
        rating: number;
        at: string;
        state?: number;
      }>;
    };
    const thin = after.reviewLogs.find(
      (l) => l.cardId === card.id && l.rating === 1,
    );
    const enriched = after.reviewLogs.find(
      (l) => l.cardId === card.id && l.rating === 3,
    );
    expect(thin).toBeDefined();
    expect(thin?.state).toBeUndefined();
    expect(enriched?.state).toBe(0);

    const rows = guestListStrugglingCards(storage);
    expect(rows.some((r) => r.id === card.id && r.again_14d === 1)).toBe(true);
  });

  it("day-sticky intro: grading New cards reduces same-day remaining slice", async () => {
    enterGuest(storage);
    guestPutStudyPrefs(
      { introBudget: 5, reviewBudget: 200, rFloor: 0.8 },
      storage,
    );
    const subject = guestCreateSubject("Sticky subject", storage);
    const deck = guestCreateDeck("Sticky deck", subject.id, storage);
    guestAddAcceptedCards(
      deck.id,
      Array.from({ length: 12 }, (_, i) => ({
        front: `Sticky Q${i}?`,
        back: `A${i}`,
      })),
      storage,
    );
    const day = "2026-10-28";
    const first = guestListDueCards({ localDay: day }, storage);
    expect(first.meta.introUsed).toBe(5);
    for (const card of first.cards) {
      await guestReviewCard(card.id, 3, storage, { localDay: day });
    }
    const second = guestListDueCards({ localDay: day }, storage);
    expect(second.meta.introAlreadyUsedToday).toBe(5);
    expect(second.meta.introUsed).toBe(0);
    expect(second.meta.heldIntroCount).toBeGreaterThan(0);
  });

  it("listDue peeks deferrals without writing dues until commitPacing", async () => {
    enterGuest(storage);
    guestPutStudyPrefs(
      { introBudget: 1, reviewBudget: 1, rFloor: 0.5 },
      storage,
    );
    const subject = guestCreateSubject("Defer subject", storage);
    const deck = guestCreateDeck("Defer deck", subject.id, storage);
    // Seed many reviews via schedules so soft budget can defer.
    const added = guestAddAcceptedCards(
      deck.id,
      Array.from({ length: 5 }, (_, i) => ({
        front: `R${i}?`,
        back: `r${i}`,
      })),
      storage,
    );
    const nowIso = new Date().toISOString();
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      cards: Array<{ id: string; due?: string }>;
      schedules: Record<string, unknown>;
    };
    for (const card of added) {
      raw.schedules[card.id] = {
        state: 2, // Review
        reps: 5,
        lapses: 0,
        stability: 100,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 10,
        learning_steps: 0,
        last_review: "2026-10-27T12:00:00.000Z",
      };
      const idx = raw.cards.findIndex((c) => c.id === card.id);
      if (idx >= 0) raw.cards[idx] = { ...raw.cards[idx]!, due: nowIso };
    }
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    const peek = guestListDueCards(undefined, storage);
    const duesBefore = JSON.parse(storage.getItem(STORE_KEY)!).cards.map(
      (c: { id: string; due?: string }) => [c.id, c.due],
    );
    expect(peek.pendingDeferrals?.length ?? 0).toBeGreaterThanOrEqual(0);
    // Re-peek without commit: dues unchanged.
    guestListDueCards(undefined, storage);
    const duesAfterPeek = JSON.parse(storage.getItem(STORE_KEY)!).cards.map(
      (c: { id: string; due?: string }) => [c.id, c.due],
    );
    expect(duesAfterPeek).toEqual(duesBefore);
  });

  it("filters due cards by deckId", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Filter subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const [a] = guestAddAcceptedCards(
      deckA.id,
      [{ front: "A?", back: "a" }],
      storage,
    );
    const [b] = guestAddAcceptedCards(
      deckB.id,
      [{ front: "B?", back: "b" }],
      storage,
    );
    const due = guestListDueCards({ deckId: deckA.id }, storage).cards;
    expect(due.map((c) => c.id)).toContain(a!.id);
    expect(due.map((c) => c.id)).not.toContain(b!.id);
    expect(due.every((c) => c.deck_id === deckA.id)).toBe(true);
  });

  it("interleaves multi-deck review due order for a subject", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Interleave subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const [a1, a2] = guestAddAcceptedCards(
      deckA.id,
      [
        { front: "A1?", back: "a1" },
        { front: "A2?", back: "a2" },
      ],
      storage,
    );
    const [b1] = guestAddAcceptedCards(
      deckB.id,
      [{ front: "B1?", back: "b1" }],
      storage,
    );
    const dues = {
      [a1!.id]: "2026-10-28T10:00:00.000Z",
      [a2!.id]: "2026-10-28T11:00:00.000Z",
      [b1!.id]: "2026-10-28T10:30:00.000Z",
    };
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      cards: Array<{ id: string; due?: string }>;
      schedules: Record<string, unknown>;
    };
    for (const id of Object.keys(dues)) {
      raw.schedules[id] = {
        state: 2,
        reps: 5,
        lapses: 0,
        stability: 100,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 10,
        learning_steps: 0,
        last_review: "2026-10-27T12:00:00.000Z",
      };
      const idx = raw.cards.findIndex((c) => c.id === id);
      if (idx >= 0) raw.cards[idx] = { ...raw.cards[idx]!, due: dues[id] };
    }
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    const due = guestListDueCards(
      {
        subjectId: subject.id,
        localDay: "2026-10-28",
        tzOffsetMinutes: 0,
      },
      storage,
    ).cards;
    expect(due.map((c) => c.id).sort()).toEqual(
      [a1!.id, a2!.id, b1!.id].sort(),
    );
    expect(due.findIndex((c) => c.id === a1!.id)).toBeLessThan(
      due.findIndex((c) => c.id === a2!.id),
    );
    expect(new Set([due[0]!.deck_id, due[1]!.deck_id]).size).toBe(2);
  });

  it("filters due cards by subjectId via deck.subject_id", async () => {
    enterGuest(storage);
    const sub1 = guestCreateSubject("Subject One", storage);
    const sub2 = guestCreateSubject("Subject Two", storage);
    const deck1 = guestCreateDeck("D1", sub1.id, storage);
    const deck2 = guestCreateDeck("D2", sub2.id, storage);
    const [c1] = guestAddAcceptedCards(
      deck1.id,
      [{ front: "S1?", back: "1" }],
      storage,
    );
    const [c2] = guestAddAcceptedCards(
      deck2.id,
      [{ front: "S2?", back: "2" }],
      storage,
    );
    const due = guestListDueCards({ subjectId: sub1.id }, storage).cards;
    expect(due.map((c) => c.id)).toContain(c1!.id);
    expect(due.map((c) => c.id)).not.toContain(c2!.id);
  });

  it("endGuestLocal clears the guest flag so auth can take over", async () => {
    enterGuest(storage);
    expect(isGuest(storage)).toBe(true);
    endGuestLocal(storage);
    expect(isGuest(storage)).toBe(false);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBeNull();
  });

  it("guestAddAcceptedCards writes paste cards into the due queue", async () => {
    enterGuest(storage);
    const olderDue = guestListDueCards(undefined, storage).cards.map(
      (c) => c.id,
    );
    const subject = guestCreateSubject("Paste subject", storage);
    const deck = guestCreateDeck("Paste deck", subject.id, storage);
    const pairs = [
      { front: "What is osmosis?", back: "Diffusion of water" },
      { front: "Define mitosis", back: "Cell division producing two nuclei" },
    ];
    const added = guestAddAcceptedCards(deck.id, pairs, storage);
    expect(added).toHaveLength(2);
    expect(added.every((c) => c.status === "accepted")).toBe(true);
    expect(added.every((c) => c.deck_id === deck.id)).toBe(true);
    expect(added.every((c) => c.job_id === null)).toBe(true);
    expect(
      added.every(
        (c) =>
          (c.provenance as { guest?: boolean; source?: string }).guest ===
            true &&
          (c.provenance as { guest?: boolean; source?: string }).source ===
            "paste",
      ),
    ).toBe(true);
    expect(added.every((c) => c.id.startsWith("guest-card-"))).toBe(true);

    const dueIds = guestListDueCards(undefined, storage).cards.map((c) => c.id);
    const newIds = added.map((c) => c.id);
    expect(dueIds).toEqual(expect.arrayContaining([...olderDue, ...newIds]));
    expect(dueIds).toHaveLength(olderDue.length + newIds.length);
  });

  it("guestAddAcceptedCards returns [] when deck is missing", async () => {
    enterGuest(storage);
    expect(
      guestAddAcceptedCards(
        "guest-deck-missing",
        [{ front: "Q?", back: "A" }],
        storage,
      ),
    ).toEqual([]);
  });

  it("createDeckCard accepts qa and lands the id in dueIds", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Hub subject", storage);
    const deck = guestCreateDeck("Hub deck", subject.id, storage);
    const olderDue = guestListDueCards(undefined, storage).cards.map(
      (c) => c.id,
    );

    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "What is ATP?", back: "Energy currency" },
      storage,
    );

    expect(card).toMatchObject({
      deck_id: deck.id,
      type: "qa",
      front: "What is ATP?",
      back: "Energy currency",
      status: "accepted",
      job_id: null,
    });
    expect(card.id.startsWith("guest-card-")).toBe(true);
    expect(card.due).toBeTruthy();

    const listed = guestListDeckCards(deck.id, storage);
    expect(listed.map((c) => c.id)).toContain(card.id);
    expect(listed.every((c) => c.status === "accepted")).toBe(true);

    const dueIds = guestListDueCards(undefined, storage).cards.map((c) => c.id);
    expect(dueIds).toContain(card.id);
    expect(dueIds).toEqual(expect.arrayContaining([...olderDue, card.id]));
  });

  it("createDeckCard rejects occlusion and image_label", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Image subject", storage);
    const deck = guestCreateDeck("Image deck", subject.id, storage);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        {
          type: "occlusion",
          front: "ignored",
          back: "ignored",
        } as Parameters<typeof guestCreateDeckCard>[1],
        storage,
      ),
    ).toThrow(/Unsupported card type/);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        {
          type: "image_label",
          front: "Label",
          back: "Answer",
        } as Parameters<typeof guestCreateDeckCard>[1],
        storage,
      ),
    ).toThrow(/Unsupported card type/);
  });

  it("createDeckCard allows cloze with empty Extra", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Cloze subject", storage);
    const deck = guestCreateDeck("Cloze deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      {
        type: "cloze",
        front: "The {{c1::femur}} is the thigh bone",
        back: "",
      },
      storage,
    );
    expect(card.type).toBe("cloze");
    expect(card.back).toBe("");
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toContain(card.id);
  });

  it("createDeckCard rejects MCQ without valid options", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Mcq subject", storage);
    const deck = guestCreateDeck("Mcq deck", subject.id, storage);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        { type: "mcq", front: "Pick one", back: "A" },
        storage,
      ),
    ).toThrow(/MCQ requires options/);
  });

  it("createDeckCard accepts multi-blank cloze", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Cloze multi", storage);
    const deck = guestCreateDeck("Cloze multi deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      {
        type: "cloze",
        front: "The {{c1::a}} and {{c2::b}}",
        back: "",
      },
      storage,
    );
    expect(card.front).toBe("The {{c1::a}} and {{c2::b}}");
  });

  it("patchCard rejects invalid MCQ options", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Patch mcq", storage);
    const deck = guestCreateDeck("Patch mcq deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      {
        type: "mcq",
        front: "Pick",
        back: "A",
        options: ["A", "B", "C"],
      },
      storage,
    );
    expect(() =>
      guestPatchCard(card.id, { options: ["A", ""] }, storage),
    ).toThrow(/MCQ/);
  });

  it("patchCard updates front on an accepted card", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Edit subject", storage);
    const deck = guestCreateDeck("Edit deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Old front", back: "Keep back" },
      storage,
    );

    const patched = guestPatchCard(card.id, { front: "New front" }, storage);
    expect(patched.front).toBe("New front");
    expect(patched.back).toBe("Keep back");
    expect(patched.status).toBe("accepted");
    expect(guestListDeckCards(deck.id, storage)[0]?.front).toBe("New front");
  });

  it("archiveCard sets archived and removes id from due list", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Archive subject", storage);
    const deck = guestCreateDeck("Archive deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Archive me?", back: "Yes" },
      storage,
    );
    expect(
      guestListDueCards(undefined, storage).cards.some((c) => c.id === card.id),
    ).toBe(true);

    const archived = guestArchiveCard(card.id, storage);
    expect(archived.status).toBe("archived");
    expect(guestListDeckCards(deck.id, storage).map((c) => c.id)).not.toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.some((c) => c.id === card.id),
    ).toBe(false);
  });

  it("restoreCard sets accepted and returns card to the due queue", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Restore subject", storage);
    const deck = guestCreateDeck("Restore deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Restore me?", back: "Yes" },
      storage,
    );
    guestArchiveCard(card.id, storage);

    const restored = guestRestoreCard(card.id, storage);
    expect(restored.status).toBe("accepted");
    expect(guestListDeckCards(deck.id, storage).map((c) => c.id)).toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toContain(card.id);
  });

  it("moveCard updates deck_id and leaves dueIds unchanged", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Move subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const card = guestCreateDeckCard(
      deckA.id,
      { type: "qa", front: "Move me?", back: "Yes" },
      storage,
    );
    const dueBefore = guestListDueCards(undefined, storage).cards.map(
      (c) => c.id,
    );

    const moved = guestMoveCard(card.id, deckB.id, storage);
    expect(moved.deck_id).toBe(deckB.id);
    expect(
      guestListDeckCards(deckA.id, storage).map((c) => c.id),
    ).not.toContain(card.id);
    expect(guestListDeckCards(deckB.id, storage).map((c) => c.id)).toContain(
      card.id,
    );
    // Membership stays; deck interleave may reorder after deck_id changes.
    expect(
      guestListDueCards(undefined, storage)
        .cards.map((c) => c.id)
        .sort(),
    ).toEqual([...dueBefore].sort());
  });

  it("moveCard allows archived cards", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Move arch subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const card = guestCreateDeckCard(
      deckA.id,
      { type: "qa", front: "Archived move?", back: "Yes" },
      storage,
    );
    guestArchiveCard(card.id, storage);

    const moved = guestMoveCard(card.id, deckB.id, storage);
    expect(moved.deck_id).toBe(deckB.id);
    expect(moved.status).toBe("archived");
  });

  it("resetCardSchedule sets due now and keeps card in the due queue", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Reset subject", storage);
    const deck = guestCreateDeck("Reset deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    await guestReviewCard(card.id, 3, storage);

    const before = Date.now();
    const reset = guestResetCardSchedule(card.id, storage);
    expect(reset.id).toBe(card.id);
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toContain(card.id);
    const dueMs = Date.parse(reset.due!);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("migrates missing studyPrefs to defaults", async () => {
    storage.setItem(
      STORE_KEY,
      JSON.stringify({
        subjects: [
          {
            id: "sub-1",
            title: "Anatomy",
            created_at: "2024-01-01T00:00:00.000Z",
          },
        ],
        decks: [
          {
            id: "deck-1",
            title: "Bones",
            subject_id: "sub-1",
            created_at: "2024-01-01T00:00:00.000Z",
          },
        ],
        cards: [],
        dueIds: [],
      }),
    );
    expect(guestGetStudyPrefs(storage)).toEqual({
      introBudget: 20,
      reviewBudget: 200,
      rFloor: 0.9,
      desiredRetention: 0.9,
      enableFuzz: true,
      enableLoadBalance: true,
      easyDays: [
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
      ],
    });
    const persisted = JSON.parse(storage.getItem(STORE_KEY)!) as {
      studyPrefs: { introBudget: number };
    };
    expect(persisted.studyPrefs.introBudget).toBe(20);
  });

  it("caps guest intro at studyPrefs.introBudget and reports heldIntroCount", async () => {
    enterGuest(storage);
    guestPutStudyPrefs(
      { introBudget: 5, reviewBudget: 200, rFloor: 0.8 },
      storage,
    );
    const subject = guestCreateSubject("Cap subject", storage);
    const deck = guestCreateDeck("Cap deck", subject.id, storage);
    const pairs = Array.from({ length: 12 }, (_, i) => ({
      front: `Q${i}?`,
      back: `A${i}`,
    }));
    guestAddAcceptedCards(deck.id, pairs, storage);

    const { cards, meta } = guestListDueCards(undefined, storage);
    // Seed demo (4) + 12 pasted = 16 New cards; intro budget 5.
    expect(cards).toHaveLength(5);
    expect(meta.introUsed).toBe(5);
    expect(meta.heldIntroCount).toBe(11);
    expect(meta.introBudget).toBe(5);
  });

  it("Study more introBonus raises effective intro slice", async () => {
    enterGuest(storage);
    guestPutStudyPrefs(
      { introBudget: 3, reviewBudget: 200, rFloor: 0.8 },
      storage,
    );
    const subject = guestCreateSubject("Bonus subject", storage);
    const deck = guestCreateDeck("Bonus deck", subject.id, storage);
    guestAddAcceptedCards(
      deck.id,
      Array.from({ length: 10 }, (_, i) => ({
        front: `Bonus Q${i}?`,
        back: `B${i}`,
      })),
      storage,
    );

    const base = guestListDueCards(undefined, storage);
    const boosted = guestListDueCards({ introBonus: 1 }, storage);
    expect(boosted.cards.length).toBeGreaterThan(base.cards.length);
    expect(boosted.meta.heldIntroCount).toBeLessThan(base.meta.heldIntroCount);
  });

  it("local struggling ranks Again from guest review history", async () => {
    enterGuest(storage);
    const due = guestListDueCards(undefined, storage).cards;
    const id = due[0]!.id;
    expect(guestListStrugglingCards(storage)).toEqual([]);

    await guestReviewCard(id, 1, storage);
    const rows = guestListStrugglingCards(storage);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.again_14d).toBe(1);
    expect(rows[0]?.hard_14d).toBe(0);
    expect(typeof rows[0]?.type).toBe("string");
    expect(rows[0]?.type.length).toBeGreaterThan(0);
    expect(rows[0]?.has_regen_source).toBe(false);
  });

  it("two Hards in 14d surface on guest struggling", async () => {
    enterGuest(storage);
    const id = guestListDueCards(undefined, storage).cards[0]!.id;
    await guestReviewCard(id, 2, storage);
    await guestReviewCard(id, 2, storage);
    const rows = guestListStrugglingCards(storage);
    expect(rows.some((r) => r.id === id && r.hard_14d === 2)).toBe(true);
  });

  it("deleteCard removes the card, schedule, review log, and due id", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Delete subject", storage);
    const deck = guestCreateDeck("Delete deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Gone?", back: "Yes" },
      storage,
    );
    await guestReviewCard(card.id, 3, storage);

    guestDeleteCard(card.id, storage);

    expect(guestListDeckCards(deck.id, storage).map((c) => c.id)).not.toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.some((c) => c.id === card.id),
    ).toBe(false);
    const raw = storage.getItem("sugarplum.guest.store.v1");
    const parsed = JSON.parse(raw ?? "{}") as {
      schedules?: Record<string, unknown>;
      reviewLogs?: { cardId: string }[];
    };
    expect(parsed.schedules?.[card.id]).toBeUndefined();
    expect(parsed.reviewLogs?.some((l) => l.cardId === card.id)).toBe(false);
  });

  it("deleteCard rejects a non-accepted card", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Delete subject", storage);
    const deck = guestCreateDeck("Delete deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Keep", back: "Yes" },
      storage,
    );
    guestArchiveCard(card.id, storage);
    expect(() => guestDeleteCard(card.id, storage)).toThrow(
      /Only accepted cards can be deleted/,
    );
  });

  it("preserves fsrsW across studyPrefs PUT and reset clears it", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    enterGuest(storage);
    const customW = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    await guestSaveFsrsWeights(customW, storage);

    guestPutStudyPrefs({ introBudget: 7 }, storage);
    expect(guestGetStudyPrefs(storage).introBudget).toBe(7);
    expect(guestGetFsrsOptimizeStatus(storage).hasCustomW).toBe(true);
    const rawAfterPrefs = JSON.parse(storage.getItem(STORE_KEY)!) as {
      fsrsW: number[];
    };
    expect(rawAfterPrefs.fsrsW).toEqual(customW);

    await guestResetFsrsWeights(storage);
    expect(guestGetFsrsOptimizeStatus(storage).hasCustomW).toBe(false);
    expect(guestGetFsrsOptimizeStatus(storage).pending).toBe(false);
    expect(guestGetFsrsOptimizeStatus(storage).lastOptimizedAt).not.toBeNull();
  });

  it("empty dueIds after future-only reschedule does not heal into all cards", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    enterGuest(storage);
    const subject = guestCreateSubject("Heal subject", storage);
    const deck = guestCreateDeck("Heal deck", subject.id, storage);
    const [card] = guestAddAcceptedCards(
      deck.id,
      [{ front: "Q?", back: "A" }],
      storage,
    );
    await guestReviewCard(card.id, 4, storage);
    await guestReviewCard(card.id, 4, storage);
    await guestReviewCard(card.id, 4, storage);

    const customW = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    await guestSaveFsrsWeights(customW, storage);

    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      dueIds: string[];
      cards: Array<{ id: string; due: string; status: string }>;
    };
    // All accepted dues in the future → empty dueIds is intentional, not a heal.
    raw.cards = raw.cards.map((c) =>
      c.status === "accepted" ? { ...c, due: "2099-01-01T00:00:00.000Z" } : c,
    );
    raw.dueIds = [];
    storage.setItem(STORE_KEY, JSON.stringify(raw));

    guestListDueCards({ deckId: deck.id }, storage);
    const after = JSON.parse(storage.getItem(STORE_KEY)!) as {
      dueIds: string[];
    };
    expect(after.dueIds).toEqual([]);
  });

  it("save and reset weights reschedule cards with review history", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    const { replayCardFromLogs } = await import("../../src/study/fsrs/fsrsReplay");
    const { scheduleColumnsFromCard } =
      await import("../../src/study/fsrs/retrievability");
    enterGuest(storage);
    const subject = guestCreateSubject("Reschedule subject", storage);
    const deck = guestCreateDeck("Reschedule deck", subject.id, storage);
    const [card] = guestAddAcceptedCards(
      deck.id,
      [{ front: "Q?", back: "A" }],
      storage,
    );
    await guestReviewCard(card.id, 3, storage);
    await guestReviewCard(card.id, 3, storage);
    await guestReviewCard(card.id, 4, storage);

    const rawBefore = JSON.parse(storage.getItem(STORE_KEY)!) as {
      cards: Array<{ id: string; due: string }>;
      reviewLogs: Array<{ cardId: string; rating: number; at: string }>;
      schedules: Record<string, { stability: number }>;
    };
    const dueBefore = rawBefore.cards.find((c) => c.id === card.id)?.due;
    const stabilityBefore = rawBefore.schedules[card.id]?.stability;
    expect(dueBefore).toBeTruthy();
    expect(stabilityBefore).toBeTruthy();

    const customW = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    const saved = await guestSaveFsrsWeights(customW, storage);
    expect(saved.rescheduled.cardsUpdated).toBe(1);

    const rawAfterSave = JSON.parse(storage.getItem(STORE_KEY)!) as {
      cards: Array<{ id: string; due: string }>;
      schedules: Record<string, { stability: number; difficulty: number }>;
      reviewLogs: Array<{ cardId: string; rating: number; at: string }>;
    };
    const expectedCustom = await replayCardFromLogs(
      rawAfterSave.reviewLogs
        .filter((l) => l.cardId === card.id)
        .map((l) => ({ reviewed_at: l.at, rating: l.rating })),
      { desiredRetention: 0.9, enableFuzz: false, w: customW },
    );
    expect(expectedCustom).not.toBeNull();
    const customCols = scheduleColumnsFromCard(expectedCustom!);
    expect(rawAfterSave.cards.find((c) => c.id === card.id)?.due).toBe(
      customCols.due,
    );
    expect(rawAfterSave.schedules[card.id]?.stability).toBe(
      customCols.stability,
    );

    const dueAfterSave = rawAfterSave.cards.find((c) => c.id === card.id)?.due;
    guestPutStudyPrefs({ introBudget: 9 }, storage);
    const rawAfterPrefs = JSON.parse(storage.getItem(STORE_KEY)!) as {
      cards: Array<{ id: string; due: string }>;
      schedules: Record<string, { stability: number }>;
      fsrsW: number[];
    };
    expect(rawAfterPrefs.fsrsW).toEqual(customW);
    expect(rawAfterPrefs.cards.find((c) => c.id === card.id)?.due).toBe(
      dueAfterSave,
    );
    expect(rawAfterPrefs.schedules[card.id]?.stability).toBe(
      customCols.stability,
    );

    const reset = await guestResetFsrsWeights(storage);
    expect(reset.rescheduled.cardsUpdated).toBe(1);
    const rawAfterReset = JSON.parse(storage.getItem(STORE_KEY)!) as {
      cards: Array<{ id: string; due: string }>;
      schedules: Record<string, { stability: number }>;
      reviewLogs: Array<{ cardId: string; rating: number; at: string }>;
    };
    const expectedDefault = await replayCardFromLogs(
      rawAfterReset.reviewLogs
        .filter((l) => l.cardId === card.id)
        .map((l) => ({ reviewed_at: l.at, rating: l.rating })),
      { desiredRetention: 0.9, enableFuzz: false },
    );
    expect(expectedDefault).not.toBeNull();
    const defaultCols = scheduleColumnsFromCard(expectedDefault!);
    expect(rawAfterReset.cards.find((c) => c.id === card.id)?.due).toBe(
      defaultCols.due,
    );
    expect(rawAfterReset.schedules[card.id]?.stability).toBe(
      defaultCols.stability,
    );
  });
});
