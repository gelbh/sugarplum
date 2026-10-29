import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bumpIntroBonus,
  getIntroBonus,
  setIntroBonus,
} from "../../src/study/introBonus";

function installMemorySessionStorage() {
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
  Object.defineProperty(globalThis, "sessionStorage", {
    value: api,
    configurable: true,
  });
}

beforeEach(() => {
  installMemorySessionStorage();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("introBonus day-scoped storage", () => {
  it("defaults to 0 and bumps within the same local day", () => {
    const day = new Date(2026, 9, 28, 12, 0, 0);
    expect(getIntroBonus(day)).toBe(0);
    expect(bumpIntroBonus(day)).toBe(1);
    expect(getIntroBonus(day)).toBe(1);
    expect(bumpIntroBonus(day)).toBe(2);
  });

  it("resets when the local day changes", () => {
    const day1 = new Date(2026, 9, 28, 12, 0, 0);
    setIntroBonus(3, day1);
    expect(getIntroBonus(day1)).toBe(3);
    const day2 = new Date(2026, 9, 29, 1, 0, 0);
    expect(getIntroBonus(day2)).toBe(0);
  });
});
