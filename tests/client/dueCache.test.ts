import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDueCache, saveDueCache } from "../../src/study/dueCache";
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
  it("round-trips due cards through localStorage", () => {
    saveDueCache([sample]);
    const snap = loadDueCache();
    expect(snap?.cards).toHaveLength(1);
    expect(snap?.cards[0]?.id).toBe("c1");
    expect(snap?.savedAt).toBeTruthy();
  });

  it("returns null when empty", () => {
    expect(loadDueCache()).toBeNull();
  });
});
