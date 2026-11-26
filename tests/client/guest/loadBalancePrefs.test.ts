import { beforeEach, describe, expect, it } from "vitest";
import { enterGuest } from "../../../src/guest/session";
import {
  clearGuestStore,
  guestGetStudyPrefs,
  guestPutStudyPrefs,
} from "../../../src/guest/store";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

describe("guest load balance prefs", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    clearGuestStore(storage);
  });

  it("persists enableLoadBalance and easyDays", () => {
    enterGuest(storage);
    const easyDays = [
      "minimum",
      "normal",
      "normal",
      "normal",
      "normal",
      "normal",
      "reduced",
    ] as const;
    guestPutStudyPrefs(
      {
        introBudget: 20,
        reviewBudget: 200,
        enableLoadBalance: false,
        easyDays: [...easyDays],
      },
      storage,
    );
    expect(guestGetStudyPrefs(storage)).toMatchObject({
      enableLoadBalance: false,
      easyDays: [...easyDays],
    });
  });

  it("defaults enableLoadBalance true after enterGuest", () => {
    enterGuest(storage);
    expect(guestGetStudyPrefs(storage).enableLoadBalance).toBe(true);
    expect(guestGetStudyPrefs(storage).easyDays).toHaveLength(7);
  });
});
