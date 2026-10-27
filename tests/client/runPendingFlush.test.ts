import { describe, expect, it, vi } from "vitest";
import type { CardDraftView } from "../../src/api/client";
import {
  formatFlushSummary,
  isNetworkGradeError,
  runPendingFlush,
} from "../../src/study/runPendingFlush";
import type { PendingGrade } from "../../src/study/pendingGrades";
import { ApiError } from "../../src/api/client";

function grade(
  cardId: string,
  rating: 1 | 2 | 3 | 4,
): PendingGrade {
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
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await runPendingFlush("u1", {
      isGuestFn: () => false,
      listPending: () => [grade("c1", 1), grade("c2", 2), grade("c3", 3)],
      listDue,
      review,
      replacePending,
      saveDue,
    });
    expect(result).toEqual({ applied: 1, skipped: 0, due: duePost });
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
    expect(result).toEqual({ applied: 1, skipped: 0, due: null });
    expect(saveDue).not.toHaveBeenCalled();
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
    expect(formatFlushSummary({ applied: 0, skipped: 3 })).toBe(
      "Skipped 3.",
    );
  });
});

describe("isNetworkGradeError", () => {
  it("treats ApiError as non-network and TypeError as network", () => {
    expect(isNetworkGradeError(new ApiError(500, "boom"))).toBe(false);
    expect(isNetworkGradeError(new TypeError("Failed to fetch"))).toBe(true);
  });
});
