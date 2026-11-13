import { beforeEach, describe, expect, it } from "vitest";
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
  });

  it("returns gamification null and counts local grades", async () => {
    const subject = guestCreateSubject("Vet", storage);
    const deck = guestCreateDeck("Deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    await guestReviewCard(card.id, 1, storage, {
      localDay: "2026-11-13",
    });
    await guestReviewCard(card.id, 3, storage, {
      localDay: "2026-11-13",
    });

    const summary = guestInsightsSummary(
      {
        now: new Date("2026-11-13T15:00:00.000Z"),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      },
      storage,
    );
    expect(summary.gamification).toBeNull();
    expect(summary.kpis.reviewsInWindow).toBeGreaterThanOrEqual(2);
    expect(
      summary.gradeCounts.again +
        summary.gradeCounts.hard +
        summary.gradeCounts.good +
        summary.gradeCounts.easy,
    ).toBeGreaterThanOrEqual(2);
    expect(storage.getItem(GUEST_STORE_KEY)).toBeTruthy();
  });
});
