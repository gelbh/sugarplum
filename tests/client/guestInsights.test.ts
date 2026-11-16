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
  peekGuestStore,
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
    expect(summary.activityByDay).toHaveLength(90);
    expect(summary.window.activityDays).toBe(90);
    expect(summary.kpis.reviewsInWindow).toBe(2);
    expect(summary.kpis.reviewedToday).toBe(2);
    expect(summary.gradeCounts).toEqual({
      again: 1,
      hard: 0,
      good: 1,
      easy: 0,
    });
    expect(summary.futureDue).toHaveLength(14);
    expect(summary.hourlySuccess).toHaveLength(24);
    expect(summary.kpis.trueRetention.windowDays).toBe(30);
    expect(summary.gradeCountsByMaturity).toBeTruthy();
    expect(Array.isArray(summary.kpis.subjectDifficultyStability)).toBe(true);
    expect(summary.kpis.subjectDifficultyStability[0]?.title).toBe("Vet");
    const store = peekGuestStore(storage);
    expect(store?.reviewLogs.at(-1)?.scheduledDays).toEqual(expect.any(Number));
    expect(storage.getItem(GUEST_STORE_KEY)).toBeTruthy();
  });

  it("persists pre-review scheduledDays on each guest grade", async () => {
    const subject = guestCreateSubject("Vet", storage);
    const deck = guestCreateDeck("Deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    await guestReviewCard(card.id, 3, storage);
    const afterFirst = peekGuestStore(storage);
    expect(afterFirst?.reviewLogs).toHaveLength(1);
    expect(afterFirst?.reviewLogs[0]?.scheduledDays).toBe(0);
    const preSecond = afterFirst?.schedules[card.id]?.scheduled_days;
    expect(preSecond).toEqual(expect.any(Number));

    await guestReviewCard(card.id, 3, storage);
    const afterSecond = peekGuestStore(storage);
    expect(afterSecond?.reviewLogs).toHaveLength(2);
    expect(afterSecond?.reviewLogs[1]?.scheduledDays).toBe(preSecond);
  });
});
