import { beforeEach, describe, expect, it } from "vitest";
import { endGuestLocal } from "../../src/guest/endGuestLocal";
import { enterGuest, GUEST_FLAG_KEY, isGuest } from "../../src/guest/session";
import {
  clearGuestStore,
  guestAddAcceptedCards,
  guestCreateDeck,
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

  it("guestAddAcceptedCards writes paste cards and prepends dueIds", () => {
    enterGuest(storage);
    const olderDue = guestListDueCards(storage).map((c) => c.id);
    const deck = guestCreateDeck("Paste deck", storage);
    const pairs = [
      { front: "What is osmosis?", back: "Diffusion of water" },
      { front: "Define mitosis", back: "Cell division producing two nuclei" },
    ];
    const added = guestAddAcceptedCards(deck.id, pairs, storage);
    expect(added).toHaveLength(2);
    expect(added.every((c) => c.status === "accepted")).toBe(true);
    expect(added.every((c) => c.deck_id === deck.id)).toBe(true);
    expect(added.every((c) => c.job_id === null)).toBe(true);
    expect(
      added.every(
        (c) =>
          (c.provenance as { guest?: boolean; source?: string }).guest ===
            true &&
          (c.provenance as { guest?: boolean; source?: string }).source ===
            "paste",
      ),
    ).toBe(true);
    expect(added.every((c) => c.id.startsWith("guest-card-"))).toBe(true);

    const due = guestListDueCards(storage);
    const newIds = added.map((c) => c.id);
    expect(due.slice(0, 2).map((c) => c.id)).toEqual(newIds);
    expect(due.map((c) => c.id).slice(2)).toEqual(olderDue);
  });

  it("guestAddAcceptedCards returns [] when deck is missing", () => {
    enterGuest(storage);
    expect(
      guestAddAcceptedCards(
        "guest-deck-missing",
        [{ front: "Q?", back: "A" }],
        storage,
      ),
    ).toEqual([]);
  });
});
