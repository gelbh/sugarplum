import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { flushPendingGrades } from "../../src/study/flushPendingGrades";
import type { PendingGrade } from "../../src/study/pendingGrades";

function grade(
  cardId: string,
  rating: 1 | 2 | 3 | 4,
  queuedAt = "2026-01-01T00:00:00.000Z",
): PendingGrade {
  return { cardId, rating, queuedAt };
}

describe("flushPendingGrades", () => {
  it("applies due grades in order via review", async () => {
    const review = vi.fn().mockResolvedValue({});
    const pending = [grade("c1", 1), grade("c2", 3)];
    const result = await flushPendingGrades({
      pending,
      dueIds: new Set(["c1", "c2"]),
      review,
    });
    expect(review).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenNthCalledWith(1, "c1", 1);
    expect(review).toHaveBeenNthCalledWith(2, "c2", 3);
    expect(result).toEqual({ applied: 2, skipped: 0, remaining: [] });
  });

  it("skips grades whose cardId is not in dueIds without calling review", async () => {
    const review = vi.fn().mockResolvedValue({});
    const pending = [grade("stale", 2), grade("c1", 4)];
    const result = await flushPendingGrades({
      pending,
      dueIds: new Set(["c1"]),
      review,
    });
    expect(review).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledWith("c1", 4);
    expect(result).toEqual({ applied: 1, skipped: 1, remaining: [] });
  });

  it("skips on ApiError 404 and 400 and continues", async () => {
    const review = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(404, "gone"))
      .mockRejectedValueOnce(new ApiError(400, "bad"))
      .mockResolvedValueOnce({});
    const pending = [grade("a", 1), grade("b", 2), grade("c", 3)];
    const result = await flushPendingGrades({
      pending,
      dueIds: new Set(["a", "b", "c"]),
      review,
    });
    expect(result).toEqual({ applied: 1, skipped: 2, remaining: [] });
  });

  it("stops on network error and keeps failed item plus rest as remaining", async () => {
    const review = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({});
    const pending = [grade("a", 1), grade("b", 2), grade("c", 3)];
    const result = await flushPendingGrades({
      pending,
      dueIds: new Set(["a", "b", "c"]),
      review,
    });
    expect(review).toHaveBeenCalledTimes(2);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.remaining).toEqual([grade("b", 2), grade("c", 3)]);
  });

  it("applies only once when the same cardId appears twice in pending", async () => {
    const review = vi.fn().mockResolvedValue({});
    const pending = [grade("c1", 1), grade("c1", 4)];
    const dueIds = new Set(["c1"]);
    const result = await flushPendingGrades({
      pending,
      dueIds,
      review,
    });
    expect(review).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledWith("c1", 1);
    expect(result).toEqual({ applied: 1, skipped: 1, remaining: [] });
    expect(dueIds.has("c1")).toBe(false);
  });

  it("uses custom isSkipStatus when provided", async () => {
    const review = vi.fn().mockRejectedValue(new ApiError(409, "conflict"));
    const result = await flushPendingGrades({
      pending: [grade("a", 1), grade("b", 2)],
      dueIds: new Set(["a", "b"]),
      review,
      isSkipStatus: (err) => err instanceof ApiError && err.status === 409,
    });
    expect(result).toEqual({ applied: 0, skipped: 2, remaining: [] });
  });

  it("does not touch localStorage", async () => {
    const store = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    });
    const removeItem = vi.fn((key: string) => {
      store.delete(key);
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem,
        removeItem,
        clear: () => store.clear(),
        get length() {
          return store.size;
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
      },
      configurable: true,
    });
    store.set("sentinel", "1");
    await flushPendingGrades({
      pending: [grade("c1", 1)],
      dueIds: new Set(["c1"]),
      review: async () => ({}),
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(store.get("sentinel")).toBe("1");
  });
});
