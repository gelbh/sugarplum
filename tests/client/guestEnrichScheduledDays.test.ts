import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichGuestReviewLogs } from "../../src/guest/enrichScheduledDays";
import type { GuestReviewLog } from "../../src/guest/storeTypes";
import { clearSchedulerCache } from "../../src/study/fsrsFactory";

describe("enrichGuestReviewLogs", () => {
  beforeEach(() => {
    clearSchedulerCache();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T15:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    clearSchedulerCache();
  });

  it("fills missing scheduledDays and leaves existing values", async () => {
    const logs: GuestReviewLog[] = [
      { cardId: "c1", rating: 3, at: "2026-11-10T12:00:00.000Z", state: 0 },
      {
        cardId: "c1",
        rating: 3,
        at: "2026-11-12T12:00:00.000Z",
        state: 2,
        scheduledDays: 99,
      },
      { cardId: "c1", rating: 1, at: "2026-11-13T12:00:00.000Z", state: 2 },
    ];
    const changed = await enrichGuestReviewLogs(logs, {
      desiredRetention: 0.9,
      enableFuzz: true,
      modelVersion: "FSRS-7",
    });
    expect(changed).toBe(true);
    expect(logs[0]?.scheduledDays).toBe(0);
    expect(logs[1]?.scheduledDays).toBe(99);
    expect(logs[2]?.scheduledDays).toEqual(expect.any(Number));
    expect(Number.isFinite(logs[2]?.scheduledDays)).toBe(true);
  });

  it("is idempotent when all logs already have scheduledDays", async () => {
    const logs: GuestReviewLog[] = [
      {
        cardId: "c1",
        rating: 3,
        at: "2026-11-10T12:00:00.000Z",
        scheduledDays: 0,
      },
      {
        cardId: "c1",
        rating: 3,
        at: "2026-11-12T12:00:00.000Z",
        scheduledDays: 2,
      },
    ];
    const changed = await enrichGuestReviewLogs(logs, {
      desiredRetention: 0.9,
      enableFuzz: false,
      modelVersion: "FSRS-7",
    });
    expect(changed).toBe(false);
    expect(logs[0]?.scheduledDays).toBe(0);
    expect(logs[1]?.scheduledDays).toBe(2);
  });
});
