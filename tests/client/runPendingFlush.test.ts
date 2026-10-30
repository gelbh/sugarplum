import { describe, expect, it, vi } from "vitest";
import type { CardDraftView, UnlockView } from "../../src/api/client";
import {
  formatFlushSummary,
  isNetworkGradeError,
  mergeFlushRemaining,
  runPendingFlush,
} from "../../src/study/runPendingFlush";
import type { PendingGrade } from "../../src/study/pendingGrades";
import { ApiError } from "../../src/api/client";

function grade(cardId: string, rating: 1 | 2 | 3 | 4): PendingGrade {
  return { cardId, rating, queuedAt: "2026-01-01T00:00:00.000Z" };
}

function card(id: string): CardDraftView {
  return {
    id,
    deck_id: "d1",
    type: "basic",
    front: "q",
    back: "a",
    status: "accepted",
  } as CardDraftView;
}

const firstBite: UnlockView = {
  id: "reviews_1",
  title: "First bite",
  fruitType: "apple",
  rarity: "common",
  traits: { shine: "low", colour: "dull", status: "bruised" },
};

describe("runPendingFlush", () => {
  it("returns null for guest without calling due/review", async () => {
    const listDue = vi.fn();
    const review = vi.fn();
    const result = await runPendingFlush("u1", {
      isGuestFn: () => true,
      listPending: () => [grade("c1", 3)],
      listDue,
      review,
    });
    expect(result).toBeNull();
    expect(listDue).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it("returns null when pending is empty", async () => {
    const listDue = vi.fn();
    const result = await runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending: () => [],
      listDue,
    });
    expect(result).toBeNull();
    expect(listDue).not.toHaveBeenCalled();
  });

  it("flushes, persists remaining, refreshes due cache", async () => {
    const replacePending = vi.fn();
    const saveDue = vi.fn();
    const duePre = [card("c1"), card("c2")];
    const duePost = [card("c2")];
    const listDue = vi
      .fn()
      .mockResolvedValueOnce(duePre)
      .mockResolvedValueOnce(duePost);
    const review = vi
      .fn()
      .mockResolvedValueOnce({ due: "x", unlocks: [firstBite] })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending: () => [grade("c1", 1), grade("c2", 2), grade("c3", 3)],
      listDue,
      review,
      replacePending,
      saveDue,
    });
    expect(result).toEqual({
      applied: 1,
      skipped: 0,
      due: duePost,
      unlocks: [firstBite],
    });
    expect(replacePending).toHaveBeenCalledWith("u1", [
      grade("c2", 2),
      grade("c3", 3),
    ]);
    expect(listDue).toHaveBeenCalledTimes(2);
    expect(saveDue).toHaveBeenCalledWith("u1", duePost);
    expect(saveDue).not.toHaveBeenCalledWith("u1", duePre);
  });

  it("skips saveDue of pre-flush due when refresh fails after applied > 0", async () => {
    const saveDue = vi.fn();
    const duePre = [card("c1")];
    const listDue = vi
      .fn()
      .mockResolvedValueOnce(duePre)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending: () => [grade("c1", 1)],
      listDue,
      review: async () => ({}),
      replacePending: () => {},
      saveDue,
    });
    expect(result).toEqual({ applied: 1, skipped: 0, due: null, unlocks: [] });
    expect(saveDue).not.toHaveBeenCalled();
  });

  it("merges mid-flush enqueues into remaining instead of wiping them", async () => {
    const snapshot = [grade("c1", 1)];
    const midFlush = [
      grade("c1", 1),
      {
        cardId: "c9",
        rating: 3 as const,
        queuedAt: "2026-02-01T00:00:00.000Z",
      },
    ];
    let calls = 0;
    const listPending = vi.fn(() => {
      calls++;
      return calls === 1 ? snapshot : midFlush;
    });
    const replacePending = vi.fn();
    const listDue = vi
      .fn()
      .mockResolvedValueOnce([card("c1")])
      .mockResolvedValueOnce([]);
    await runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending,
      listDue,
      review: async () => ({}),
      replacePending,
      saveDue: () => {},
    });
    expect(replacePending).toHaveBeenCalledWith("u1", [
      {
        cardId: "c9",
        rating: 3,
        queuedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("shares one in-flight flush per userId", async () => {
    let resolveReview!: () => void;
    const reviewGate = new Promise<void>((r) => {
      resolveReview = r;
    });
    const review = vi.fn(async () => {
      await reviewGate;
      return {};
    });
    const listDue = vi.fn().mockResolvedValue([card("c1")]);
    const p1 = runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending: () => [grade("c1", 1)],
      listDue,
      review,
      replacePending: () => {},
      saveDue: () => {},
    });
    const p2 = runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending: () => [grade("c1", 1)],
      listDue,
      review,
      replacePending: () => {},
      saveDue: () => {},
    });
    expect(p1).toBe(p2);
    resolveReview();
    await p1;
    expect(review).toHaveBeenCalledTimes(1);
  });
});

describe("mergeFlushRemaining", () => {
  it("keeps remaining and mid-flush grades, coalesced by cardId", () => {
    const snap = [grade("c1", 1)];
    const remaining = [grade("c2", 2)];
    const after = [
      grade("c1", 1),
      grade("c2", 2),
      {
        cardId: "c3",
        rating: 3 as const,
        queuedAt: "2026-03-01T00:00:00.000Z",
      },
    ];
    expect(mergeFlushRemaining(remaining, after, snap)).toEqual([
      grade("c2", 2),
      {
        cardId: "c3",
        rating: 3,
        queuedAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("formatFlushSummary", () => {
  it("formats applied and skipped", () => {
    expect(formatFlushSummary({ applied: 2, skipped: 1 })).toBe(
      "Synced 2 grades. Skipped 1.",
    );
    expect(formatFlushSummary({ applied: 1, skipped: 0 })).toBe(
      "Synced 1 grade.",
    );
    expect(formatFlushSummary({ applied: 0, skipped: 3 })).toBe("Skipped 3.");
  });
});

describe("isNetworkGradeError", () => {
  it("treats ApiError as non-network and TypeError as network", () => {
    expect(isNetworkGradeError(new ApiError(500, "boom"))).toBe(false);
    expect(isNetworkGradeError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkGradeError(new Error("boom"))).toBe(false);
  });
});
