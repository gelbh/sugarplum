import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDueCache,
  filterDueExcludingPending,
  loadDueCache,
  pruneDueCacheCard,
  saveDueCache,
} from "../../src/study/dueCache";
import type { CardDraftView } from "../../src/api/client";

const sample: CardDraftView = {
  id: "c1",
  deck_id: "d1",
  job_id: null,
  type: "qa",
  front: "Q",
  back: "A",
  provenance: null,
  status: "accepted",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
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

describe("dueCache", () => {
  it("round-trips due cards through localStorage for a user", () => {
    saveDueCache("user-a", [sample]);
    const snap = loadDueCache("user-a");
    expect(snap?.userId).toBe("user-a");
    expect(snap?.cards).toHaveLength(1);
    expect(snap?.cards[0]?.id).toBe("c1");
    expect(snap?.savedAt).toBeTruthy();
  });

  it("returns null when empty", () => {
    expect(loadDueCache("user-a")).toBeNull();
  });

  it("does not leak another user's cache", () => {
    saveDueCache("user-a", [sample]);
    expect(loadDueCache("user-b")).toBeNull();
  });

  it("clearDueCache drops one user or all", () => {
    saveDueCache("user-a", [sample]);
    saveDueCache("user-b", [sample]);
    clearDueCache("user-a");
    expect(loadDueCache("user-a")).toBeNull();
    expect(loadDueCache("user-b")?.cards).toHaveLength(1);
    clearDueCache();
    expect(loadDueCache("user-b")).toBeNull();
  });

  it("pruneDueCacheCard removes one card from the snapshot", () => {
    const other = { ...sample, id: "c2" };
    saveDueCache("user-a", [sample, other]);
    pruneDueCacheCard("user-a", "c1");
    expect(loadDueCache("user-a")?.cards.map((c) => c.id)).toEqual(["c2"]);
  });

  it("filterDueExcludingPending drops pending card ids", () => {
    const other = { ...sample, id: "c2" };
    expect(
      filterDueExcludingPending([sample, other], new Set(["c1"])).map(
        (c) => c.id,
      ),
    ).toEqual(["c2"]);
  });
});
