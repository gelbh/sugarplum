import { beforeEach, describe, expect, it } from "vitest";
import { endGuestLocal } from "../../src/guest/endGuestLocal";
import { enterGuest, GUEST_FLAG_KEY, isGuest } from "../../src/guest/session";
import {
  clearGuestStore,
  guestListDueCards,
  guestReviewCard,
} from "../../src/guest/store";

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

describe("guest store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    clearGuestStore(storage);
  });

  it("seeds due cards after enterGuest + list", () => {
    enterGuest(storage);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    const due = guestListDueCards(storage);
    expect(due.length).toBeGreaterThan(0);
    expect(due[0]?.front.length).toBeGreaterThan(0);
  });

  it("cycles graded card to the end of the due queue", () => {
    enterGuest(storage);
    const due = guestListDueCards(storage);
    const id = due[0]!.id;
    guestReviewCard(id, 3, storage);
    const next = guestListDueCards(storage);
    expect(next.length).toBe(due.length);
    expect(next[next.length - 1]?.id).toBe(id);
    expect(next[0]?.id).not.toBe(id);
  });

  it("endGuestLocal clears the guest flag so auth can take over", () => {
    enterGuest(storage);
    expect(isGuest(storage)).toBe(true);
    endGuestLocal(storage);
    expect(isGuest(storage)).toBe(false);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBeNull();
  });
});
