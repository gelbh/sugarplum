import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingGrades,
  dropPendingGrade,
  enqueuePendingGrade,
  listPendingGrades,
  pendingCardIdSet,
  replacePendingGrades,
} from "../../src/study/pendingGrades";

function installMemoryLocalStorage(opts?: { throwOnSet?: boolean }) {
  const store = new Map<string, string>();
  const api = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (opts?.throwOnSet) throw new Error("QuotaExceededError");
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: api,
    configurable: true,
  });
}

beforeEach(() => {
  installMemoryLocalStorage();
});

afterEach(() => {
  localStorage.clear();
});

describe("pendingGrades", () => {
  it("enqueues grades in order with queuedAt ISO timestamps", () => {
    expect(enqueuePendingGrade("user-a", "c1", 1)).toBe(true);
    expect(enqueuePendingGrade("user-a", "c2", 3)).toBe(true);
    const pending = listPendingGrades("user-a");
    expect(pending).toHaveLength(2);
    expect(pending[0]).toMatchObject({ cardId: "c1", rating: 1 });
    expect(pending[1]).toMatchObject({ cardId: "c2", rating: 3 });
    expect(pending[0]?.queuedAt).toBeTruthy();
  });

  it("coalesces by cardId so last rating wins", () => {
    enqueuePendingGrade("user-a", "c1", 1);
    enqueuePendingGrade("user-a", "c1", 4);
    const pending = listPendingGrades("user-a");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ cardId: "c1", rating: 4 });
  });

  it("returns false when storage write fails", () => {
    installMemoryLocalStorage({ throwOnSet: true });
    expect(enqueuePendingGrade("user-a", "c1", 1)).toBe(false);
    expect(listPendingGrades("user-a")).toEqual([]);
  });

  it("returns empty array when no pending grades", () => {
    expect(listPendingGrades("user-a")).toEqual([]);
  });

  it("does not leak another user's pending grades", () => {
    enqueuePendingGrade("user-a", "c1", 2);
    expect(listPendingGrades("user-b")).toEqual([]);
    expect(pendingCardIdSet("user-a").has("c1")).toBe(true);
  });

  it("replacePendingGrades overwrites the queue for a user", () => {
    enqueuePendingGrade("user-a", "c1", 1);
    expect(
      replacePendingGrades("user-a", [
        { cardId: "c9", rating: 4, queuedAt: "2026-01-01T00:00:00.000Z" },
      ]),
    ).toBe(true);
    expect(listPendingGrades("user-a")).toEqual([
      { cardId: "c9", rating: 4, queuedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("clearPendingGrades drops one user or all", () => {
    enqueuePendingGrade("user-a", "c1", 1);
    enqueuePendingGrade("user-b", "c2", 2);
    clearPendingGrades("user-a");
    expect(listPendingGrades("user-a")).toEqual([]);
    expect(listPendingGrades("user-b")).toHaveLength(1);
    clearPendingGrades();
    expect(listPendingGrades("user-b")).toEqual([]);
  });

  it("dropPendingGrade removes one card and keeps the rest", () => {
    enqueuePendingGrade("user-1", "card-a", 1);
    enqueuePendingGrade("user-1", "card-b", 3);
    dropPendingGrade("user-1", "card-a");
    expect(listPendingGrades("user-1").map((item) => item.cardId)).toEqual([
      "card-b",
    ]);
  });
});
