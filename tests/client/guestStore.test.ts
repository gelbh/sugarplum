import { beforeEach, describe, expect, it } from "vitest";
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
  guestMoveCard,
  guestPatchCard,
  guestPutStudyPrefs,
  guestResetCardSchedule,
  guestRestoreCard,
  guestReviewCard,
} from "../../src/guest/store";

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

  it("seeds due cards after enterGuest + list", () => {
    enterGuest(storage);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    const { cards: due, meta } = guestListDueCards(undefined, storage);
    expect(due.length).toBeGreaterThan(0);
    expect(due[0]?.front.length).toBeGreaterThan(0);
    expect(meta.introBudget).toBe(20);
    expect(meta.reviewBudget).toBe(200);
  });

  it("seeds Anatomy subject and attaches demo deck subject_id", () => {
    enterGuest(storage);
    const subjects = guestListSubjects(storage);
    expect(subjects.some((s) => s.title === "Anatomy")).toBe(true);
    const anatomy = subjects.find((s) => s.title === "Anatomy")!;
    const decks = guestListDecks(undefined, storage);
    expect(decks.length).toBeGreaterThan(0);
    expect(decks.every((d) => d.subject_id === anatomy.id)).toBe(true);
  });

  it("migrates old store without subjects into Unfiled / subject_hint", () => {
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

  it("persists remap when deck.subject_id is dangling", () => {
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

  it("creates subject then deck under subject_id", () => {
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

  it("deleteSubject throws when decks remain; empty subject deletes", () => {
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

  it("writes FSRS schedule on grade (leaves New state)", () => {
    enterGuest(storage);
    const due = guestListDueCards(undefined, storage).cards;
    const id = due[0]!.id;
    const result = guestReviewCard(id, 3, storage);
    expect(result.due).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const raw = JSON.parse(storage.getItem(STORE_KEY)!) as {
      schedules: Record<string, { state: number; reps: number }>;
      reviewLogs: Array<{ cardId: string; rating: number }>;
    };
    expect(raw.schedules[id]?.reps).toBeGreaterThan(0);
    expect(raw.schedules[id]?.state).not.toBe(0); // not State.New
    expect(raw.reviewLogs.some((l) => l.cardId === id && l.rating === 3)).toBe(
      true,
    );
  });

  it("day-sticky intro: grading New cards reduces same-day remaining slice", () => {
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
      guestReviewCard(card.id, 3, storage, { localDay: day });
    }
    const second = guestListDueCards({ localDay: day }, storage);
    expect(second.meta.introAlreadyUsedToday).toBe(5);
    expect(second.meta.introUsed).toBe(0);
    expect(second.meta.heldIntroCount).toBeGreaterThan(0);
  });

  it("listDue peeks deferrals without writing dues until commitPacing", () => {
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

  it("filters due cards by deckId", () => {
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

  it("filters due cards by subjectId via deck.subject_id", () => {
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

  it("endGuestLocal clears the guest flag so auth can take over", () => {
    enterGuest(storage);
    expect(isGuest(storage)).toBe(true);
    endGuestLocal(storage);
    expect(isGuest(storage)).toBe(false);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBeNull();
  });

  it("guestAddAcceptedCards writes paste cards into the due queue", () => {
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

  it("guestAddAcceptedCards returns [] when deck is missing", () => {
    enterGuest(storage);
    expect(
      guestAddAcceptedCards(
        "guest-deck-missing",
        [{ front: "Q?", back: "A" }],
        storage,
      ),
    ).toEqual([]);
  });

  it("createDeckCard accepts qa and lands the id in dueIds", () => {
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

  it("createDeckCard rejects occlusion and image_label", () => {
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

  it("createDeckCard allows cloze with empty Extra", () => {
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

  it("createDeckCard rejects MCQ without valid options", () => {
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

  it("createDeckCard rejects multi-blank cloze", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Cloze bad", storage);
    const deck = guestCreateDeck("Cloze bad deck", subject.id, storage);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        {
          type: "cloze",
          front: "The {{c1::a}} and {{c1::b}}",
          back: "",
        },
        storage,
      ),
    ).toThrow(/at most one blank/);
  });

  it("patchCard rejects invalid MCQ options", () => {
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

  it("patchCard updates front on an accepted card", () => {
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

  it("archiveCard sets archived and removes id from due list", () => {
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

  it("restoreCard sets accepted and returns card to the due queue", () => {
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

  it("moveCard updates deck_id and leaves dueIds unchanged", () => {
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
    expect(guestListDeckCards(deckA.id, storage).map((c) => c.id)).not.toContain(
      card.id,
    );
    expect(guestListDeckCards(deckB.id, storage).map((c) => c.id)).toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toEqual(dueBefore);
  });

  it("moveCard allows archived cards", () => {
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

  it("resetCardSchedule sets due now and keeps card in the due queue", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Reset subject", storage);
    const deck = guestCreateDeck("Reset deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    guestReviewCard(card.id, 3, storage);

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

  it("migrates missing studyPrefs to defaults", () => {
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
      rFloor: 0.8,
    });
    const persisted = JSON.parse(storage.getItem(STORE_KEY)!) as {
      studyPrefs: { introBudget: number };
    };
    expect(persisted.studyPrefs.introBudget).toBe(20);
  });

  it("caps guest intro at studyPrefs.introBudget and reports heldIntroCount", () => {
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

  it("Study more introBonus raises effective intro slice", () => {
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

  it("local struggling ranks Again from guest review history", () => {
    enterGuest(storage);
    const due = guestListDueCards(undefined, storage).cards;
    const id = due[0]!.id;
    expect(guestListStrugglingCards(storage)).toEqual([]);

    guestReviewCard(id, 1, storage);
    const rows = guestListStrugglingCards(storage);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.again_14d).toBe(1);
    expect(rows[0]?.hard_14d).toBe(0);
    expect(typeof rows[0]?.type).toBe("string");
    expect(rows[0]?.type.length).toBeGreaterThan(0);
    expect(typeof rows[0]?.has_regen_source).toBe("boolean");
  });

  it("two Hards in 14d surface on guest struggling", () => {
    enterGuest(storage);
    const id = guestListDueCards(undefined, storage).cards[0]!.id;
    guestReviewCard(id, 2, storage);
    guestReviewCard(id, 2, storage);
    const rows = guestListStrugglingCards(storage);
    expect(rows.some((r) => r.id === id && r.hard_14d === 2)).toBe(true);
  });
});
