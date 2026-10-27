import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_FLAG_KEY } from "../../src/guest/session";
import {
  SNAPSHOT_KEY,
  snapshotGuestForMerge,
  tryMergeGuestAfterAuth,
} from "../../src/guest/mergeOnAuth";

const STORE_KEY = "sugarplum.guest.store.v1";

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

const userDeck = {
  id: "guest-deck-user-1",
  title: "Mine",
  subject_hint: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const pasteStore = {
  decks: [
    {
      id: "guest-deck-demo",
      title: "Guest demo deck",
      subject_hint: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    userDeck,
  ],
  cards: [
    {
      id: "c1",
      deck_id: userDeck.id,
      job_id: null,
      type: "qa" as const,
      front: "Q",
      back: "A",
      provenance: { guest: true, source: "paste" },
      status: "accepted" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      due: "2026-01-01T00:00:00.000Z",
    },
  ],
  dueIds: ["c1"],
};

const seedOnlyStore = {
  decks: [
    {
      id: "guest-deck-demo",
      title: "Guest demo deck",
      subject_hint: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  cards: [
    {
      id: "guest-card-1",
      deck_id: "guest-deck-demo",
      job_id: null,
      type: "qa" as const,
      front: "Seed",
      back: "A",
      provenance: { guest: true },
      status: "accepted" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      due: "2026-01-01T00:00:00.000Z",
    },
  ],
  dueIds: ["guest-card-1"],
};

describe("mergeOnAuth", () => {
  let local: ReturnType<typeof memoryStorage>;
  let session: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    local = memoryStorage();
    session = memoryStorage();
    local.setItem(GUEST_FLAG_KEY, "1");
  });

  it("snapshotGuestForMerge copies store to sessionStorage and clears live store + flag", () => {
    local.setItem(STORE_KEY, JSON.stringify(pasteStore));
    snapshotGuestForMerge(local, session);
    expect(session.getItem(SNAPSHOT_KEY)).toBe(JSON.stringify(pasteStore));
    expect(local.getItem(STORE_KEY)).toBeNull();
    expect(local.getItem(GUEST_FLAG_KEY)).toBeNull();
  });

  it("imports paste payload then wipes guest store on success", async () => {
    local.setItem(STORE_KEY, JSON.stringify(pasteStore));
    const importGuest = vi.fn().mockResolvedValue({ deckCount: 1, cardCount: 1 });

    const result = await tryMergeGuestAfterAuth({
      local,
      session,
      importGuest,
    });

    expect(result).toBe("merged");
    expect(importGuest).toHaveBeenCalledWith({
      decks: [{ clientId: userDeck.id, title: userDeck.title }],
      cards: [{ clientDeckId: userDeck.id, front: "Q", back: "A" }],
    });
    expect(local.getItem(GUEST_FLAG_KEY)).toBeNull();
    expect(local.getItem(STORE_KEY)).toBeNull();
    expect(session.getItem(SNAPSHOT_KEY)).toBeNull();
  });

  it("skips API and wipes when seed-only", async () => {
    local.setItem(STORE_KEY, JSON.stringify(seedOnlyStore));
    const importGuest = vi.fn();

    const result = await tryMergeGuestAfterAuth({
      local,
      session,
      importGuest,
    });

    expect(result).toBe("skipped");
    expect(importGuest).not.toHaveBeenCalled();
    expect(local.getItem(GUEST_FLAG_KEY)).toBeNull();
    expect(local.getItem(STORE_KEY)).toBeNull();
  });

  it("keeps guest store but clears guest flag when import throws", async () => {
    local.setItem(STORE_KEY, JSON.stringify(pasteStore));
    const importGuest = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await tryMergeGuestAfterAuth({
      local,
      session,
      importGuest,
    });

    expect(result).toBe("failed");
    expect(local.getItem(GUEST_FLAG_KEY)).toBeNull();
    const kept = JSON.parse(local.getItem(STORE_KEY)!);
    expect(kept.cards).toEqual(pasteStore.cards);
    expect(session.getItem("sugarplum.guest.merge.failed")).toBe("1");
  });

  it("falls back to session snapshot when live store is gone", async () => {
    session.setItem(SNAPSHOT_KEY, JSON.stringify(pasteStore));
    const importGuest = vi.fn().mockResolvedValue({ deckCount: 1, cardCount: 1 });

    const result = await tryMergeGuestAfterAuth({
      local,
      session,
      importGuest,
    });

    expect(result).toBe("merged");
    expect(importGuest).toHaveBeenCalled();
    expect(session.getItem(SNAPSHOT_KEY)).toBeNull();
  });

});
