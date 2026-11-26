import { beforeEach, describe, expect, it } from "vitest";
import { endGuestLocal } from "../../../../src/guest/endGuestLocal";
import { enterGuest, GUEST_FLAG_KEY, isGuest } from "../../../../src/guest/session";
import {
  guestAddAcceptedCards,
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestListDueCards,
  guestListStrugglingCards,
  guestPutStudyPrefs,
  guestReviewCard,
} from "../../../../src/guest/store";
import { installGuestStoreTestEnv, STORE_KEY } from "./setup";

describe("guest store", () => {
  let storage: ReturnType<typeof installGuestStoreTestEnv>["storage"];

  beforeEach(() => {
    ({ storage } = installGuestStoreTestEnv());
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
});
