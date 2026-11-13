import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guestInsightsSummary } from "../../src/guest/insights";
import { enterGuest } from "../../src/guest/session";
import {
  clearGuestStore,
  GUEST_STORE_KEY,
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestReviewCard,
} from "../../src/guest/store";

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

describe("guestInsightsSummary", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    clearGuestStore(storage);
    enterGuest(storage);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T15:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns gamification null and exact grade counts under frozen clock", async () => {
    const subject = guestCreateSubject("Vet", storage);
    const deck = guestCreateDeck("Deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    await guestReviewCard(card.id, 1, storage);
    await guestReviewCard(card.id, 3, storage);

    const summary = guestInsightsSummary(
      { now: new Date("2026-11-13T15:00:00.000Z"), tzOffsetMinutes: 0 },
      storage,
    );
    expect(summary.gamification).toBeNull();
    expect(summary.reviewsPerDay).toHaveLength(30);
    expect(summary.kpis.reviewsInWindow).toBe(2);
    expect(summary.kpis.reviewedToday).toBe(2);
    expect(summary.gradeCounts).toEqual({
      again: 1,
      hard: 0,
      good: 1,
      easy: 0,
    });
    expect(storage.getItem(GUEST_STORE_KEY)).toBeTruthy();
  });
});
