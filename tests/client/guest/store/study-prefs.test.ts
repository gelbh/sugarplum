import { beforeEach, describe, expect, it } from "vitest";
import { enterGuest } from "../../../../src/guest/session";
import {
  guestAddAcceptedCards,
  guestCreateDeck,
  guestCreateSubject,
  guestGetStudyPrefs,
  guestListDueCards,
  guestListStrugglingCards,
  guestGetFsrsOptimizeStatus,
  guestPutStudyPrefs,
  guestResetFsrsWeights,
  guestReviewCard,
  guestSaveFsrsWeights,
} from "../../../../src/guest/store";
import { installGuestStoreTestEnv, STORE_KEY } from "./setup";

describe("guest store", () => {
  let storage: ReturnType<typeof installGuestStoreTestEnv>["storage"];

  beforeEach(() => {
    ({ storage } = installGuestStoreTestEnv());
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
    const { replayCardFromLogs } = await import("../../../../src/study/fsrs/fsrsReplay");
    const { scheduleColumnsFromCard } =
      await import("../../../../src/study/fsrs/retrievability");
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
