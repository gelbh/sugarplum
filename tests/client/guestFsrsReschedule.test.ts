import { describe, expect, it } from "vitest";
import { default_w } from "ts-fsrs";
import type { CardDraftView } from "../../src/api/client";
import type {
  GuestCardSchedule,
  GuestReviewLog,
} from "../../src/guest/policyDue";
import { rescheduleGuestSchedules } from "../../src/study/guestFsrsReschedule";
import { replayCardFromLogs } from "../../src/study/fsrsReplay";
import { scheduleColumnsFromCard } from "../../src/study/retrievability";

const customW = default_w.map((x, i) => (i === 8 ? x * 3 : x));

const sampleLogs: GuestReviewLog[] = [
  { cardId: "c1", rating: 3, at: "2026-01-01T12:00:00.000Z" },
  { cardId: "c1", rating: 3, at: "2026-01-03T12:00:00.000Z" },
  { cardId: "c1", rating: 4, at: "2026-01-10T12:00:00.000Z" },
];

const baseSchedule: GuestCardSchedule = {
  state: 2,
  reps: 3,
  lapses: 0,
  stability: 1,
  difficulty: 5,
  elapsed_days: 1,
  scheduled_days: 1,
  learning_steps: 0,
  last_review: "2026-01-10T12:00:00.000Z",
};

function card(id: string, due: string): CardDraftView {
  return {
    id,
    deck_id: "d1",
    type: "qa",
    front: "Q",
    back: "A",
    status: "accepted",
    due,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("rescheduleGuestSchedules", () => {
  it("rewrites schedule + due under custom w", () => {
    const expected = replayCardFromLogs(
      sampleLogs.map((l) => ({ reviewed_at: l.at, rating: l.rating })),
      { desiredRetention: 0.9, enableFuzz: false, w: customW },
    );
    expect(expected).not.toBeNull();
    const cols = scheduleColumnsFromCard(expected!);

    const result = rescheduleGuestSchedules({
      cards: [card("c1", "2026-01-02T00:00:00.000Z")],
      schedules: { c1: baseSchedule },
      reviewLogs: sampleLogs,
      prefs: { desiredRetention: 0.9, enableFuzz: true, w: customW },
      now: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(result.summary.cardsUpdated).toBe(1);
    expect(result.summary.cardsSkipped).toBe(0);
    expect(result.schedules.c1?.stability).toBe(cols.stability);
    expect(result.schedules.c1?.difficulty).toBe(cols.difficulty);
    expect(result.cards[0]?.due).toBe(cols.due);
  });

  it("is deterministic with fuzz forced off", () => {
    const input = {
      cards: [card("c1", "2026-01-02T00:00:00.000Z")],
      schedules: { c1: baseSchedule },
      reviewLogs: sampleLogs,
      prefs: {
        desiredRetention: 0.9,
        enableFuzz: true,
        w: customW,
      },
      now: new Date("2026-02-01T00:00:00.000Z"),
    };
    const a = rescheduleGuestSchedules(input);
    const b = rescheduleGuestSchedules(input);
    expect(a.cards[0]?.due).toBe(b.cards[0]?.due);
    expect(a.schedules.c1?.stability).toBe(b.schedules.c1?.stability);
  });

  it("skips cards with no logs", () => {
    const before = card("c1", "2026-01-02T00:00:00.000Z");
    const result = rescheduleGuestSchedules({
      cards: [before],
      schedules: { c1: baseSchedule },
      reviewLogs: [],
      prefs: { desiredRetention: 0.9, enableFuzz: false, w: customW },
    });
    expect(result.summary.cardsUpdated).toBe(0);
    expect(result.cards[0]?.due).toBe(before.due);
    expect(result.schedules.c1).toEqual(baseSchedule);
  });

  it("skips cards with logs but no schedule entry", () => {
    const before = card("c1", "2026-01-02T00:00:00.000Z");
    const result = rescheduleGuestSchedules({
      cards: [before],
      schedules: {},
      reviewLogs: sampleLogs,
      prefs: { desiredRetention: 0.9, enableFuzz: false, w: customW },
    });
    expect(result.summary.cardsSkipped).toBe(1);
    expect(result.summary.cardsUpdated).toBe(0);
    expect(result.cards[0]?.due).toBe(before.due);
  });

  it("reschedules thin logs without state", () => {
    const thin: GuestReviewLog[] = [
      { cardId: "c1", rating: 3, at: "2026-01-01T12:00:00.000Z" },
      { cardId: "c1", rating: 4, at: "2026-01-08T12:00:00.000Z" },
    ];
    const result = rescheduleGuestSchedules({
      cards: [card("c1", "2026-01-02T00:00:00.000Z")],
      schedules: { c1: baseSchedule },
      reviewLogs: thin,
      prefs: { desiredRetention: 0.9, enableFuzz: false, w: customW },
      now: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(result.summary.cardsUpdated).toBe(1);
    expect(result.cards[0]?.due).not.toBe("2026-01-02T00:00:00.000Z");
  });

  it("rebuilds dueIds for accepted cards due by now", () => {
    const expected = replayCardFromLogs(
      sampleLogs.map((l) => ({ reviewed_at: l.at, rating: l.rating })),
      { desiredRetention: 0.9, enableFuzz: false },
    );
    expect(expected).not.toBeNull();
    const cols = scheduleColumnsFromCard(expected!);
    const now = new Date(cols.due);
    now.setUTCDate(now.getUTCDate() + 1);

    const result = rescheduleGuestSchedules({
      cards: [card("c1", "2099-01-01T00:00:00.000Z")],
      schedules: { c1: baseSchedule },
      reviewLogs: sampleLogs,
      prefs: { desiredRetention: 0.9, enableFuzz: false },
      now,
    });
    expect(result.cards[0]?.due).toBe(cols.due);
    if (cols.due <= now.toISOString()) {
      expect(result.dueIds).toContain("c1");
    } else {
      expect(result.dueIds).not.toContain("c1");
    }
  });
});
