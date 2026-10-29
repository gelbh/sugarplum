import { beforeEach, describe, expect, it } from "vitest";
import {
  ZEN_STORAGE_KEY,
  loadZenPreference,
  saveZenPreference,
} from "../../src/study/zenPreference";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe("zenPreference", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("defaults to true (zen-first)", () => {
    expect(loadZenPreference(storage)).toBe(true);
  });

  it("round-trips on", () => {
    saveZenPreference(true, storage);
    expect(storage.getItem(ZEN_STORAGE_KEY)).toBe("1");
    expect(loadZenPreference(storage)).toBe(true);
  });

  it("round-trips off", () => {
    saveZenPreference(true, storage);
    saveZenPreference(false, storage);
    expect(storage.getItem(ZEN_STORAGE_KEY)).toBe("0");
    expect(loadZenPreference(storage)).toBe(false);
  });
});
