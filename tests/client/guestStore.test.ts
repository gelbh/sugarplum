import { beforeEach, describe, expect, it } from "vitest";
import { endGuestLocal } from "../../src/guest/endGuestLocal";
import { enterGuest, GUEST_FLAG_KEY, isGuest } from "../../src/guest/session";
import {
  clearGuestStore,
  guestAddAcceptedCards,
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestDeleteSubject,
  guestListDeckCards,
  guestListDecks,
  guestListDueCards,
  guestListSubjects,
  guestMoveCard,
  guestPatchCard,
  guestResetCardSchedule,
  guestReviewCard,
} from "../../src/guest/store";

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

describe("guest store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    clearGuestStore(storage);
  });

  it("seeds due cards after enterGuest + list", () => {
    enterGuest(storage);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    const due = guestListDueCards(undefined, storage);
    expect(due.length).toBeGreaterThan(0);
    expect(due[0]?.front.length).toBeGreaterThan(0);
  });

  it("seeds Anatomy subject and attaches demo deck subject_id", () => {
    enterGuest(storage);
    const subjects = guestListSubjects(storage);
    expect(subjects.some((s) => s.title === "Anatomy")).toBe(true);
    const anatomy = subjects.find((s) => s.title === "Anatomy")!;
    const decks = guestListDecks(undefined, storage);
    expect(decks.length).toBeGreaterThan(0);
    expect(decks.every((d) => d.subject_id === anatomy.id)).toBe(true);
  });

  it("migrates old store without subjects into Unfiled / subject_hint", () => {
    storage.setItem(
      STORE_KEY,
      JSON.stringify({
        decks: [
          {
            id: "legacy-deck-1",
            title: "Bones",
            subject_hint: "Anatomy",
            created_at: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "legacy-deck-2",
            title: "Loose notes",
            subject_hint: null,
            created_at: "2024-01-02T00:00:00.000Z",
          },
        ],
        cards: [],
        dueIds: [],
      }),
    );

    const subjects = guestListSubjects(storage);
    expect(subjects.map((s) => s.title).sort()).toEqual(["Anatomy", "Unfiled"]);
    const byTitle = Object.fromEntries(subjects.map((s) => [s.title, s.id]));
    const decks = guestListDecks(undefined, storage);
    expect(decks.find((d) => d.id === "legacy-deck-1")?.subject_id).toBe(
      byTitle.Anatomy,
    );
    expect(decks.find((d) => d.id === "legacy-deck-2")?.subject_id).toBe(
      byTitle.Unfiled,
    );
  });

  it("persists remap when deck.subject_id is dangling", () => {
    storage.setItem(
      STORE_KEY,
      JSON.stringify({
        subjects: [
          {
            id: "sub-keep",
            title: "Kept",
            created_at: "2024-01-01T00:00:00.000Z",
          },
        ],
        decks: [
          {
            id: "deck-orphan",
            title: "Orphan",
            subject_id: "sub-missing",
            subject_hint: "Anatomy",
            created_at: "2024-01-02T00:00:00.000Z",
          },
        ],
        cards: [],
        dueIds: [],
      }),
    );

    const decks = guestListDecks(undefined, storage);
    expect(decks[0]?.subject_id).not.toBe("sub-missing");
    const persisted = JSON.parse(storage.getItem(STORE_KEY)!) as {
      decks: Array<{ subject_id: string }>;
      subjects: Array<{ id: string; title: string }>;
    };
    expect(persisted.decks[0]?.subject_id).toBe(decks[0]?.subject_id);
    expect(persisted.subjects.some((s) => s.title === "Anatomy")).toBe(true);
  });

  it("creates subject then deck under subject_id", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Physiology", storage);
    expect(subject.title).toBe("Physiology");
    expect(subject.deck_count).toBe(0);

    const deck = guestCreateDeck("Cardiac", subject.id, storage);
    expect(deck.subject_id).toBe(subject.id);
    expect(deck.title).toBe("Cardiac");

    const listed = guestListSubjects(storage).find((s) => s.id === subject.id);
    expect(listed?.deck_count).toBe(1);
    expect(guestListDecks(subject.id, storage)).toHaveLength(1);
  });

  it("deleteSubject throws when decks remain; empty subject deletes", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Emptyable", storage);
    const withDecks = guestCreateSubject("Busy", storage);
    guestCreateDeck("Keep me", withDecks.id, storage);

    expect(() => guestDeleteSubject(withDecks.id, storage)).toThrow(
      /Subject still has decks/,
    );
    expect(guestListSubjects(storage).some((s) => s.id === withDecks.id)).toBe(
      true,
    );

    guestDeleteSubject(subject.id, storage);
    expect(guestListSubjects(storage).some((s) => s.id === subject.id)).toBe(
      false,
    );
  });

  it("cycles graded card to the end of the due queue", () => {
    enterGuest(storage);
    const due = guestListDueCards(undefined, storage);
    const id = due[0]!.id;
    guestReviewCard(id, 3, storage);
    const next = guestListDueCards(undefined, storage);
    expect(next.length).toBe(due.length);
    expect(next[next.length - 1]?.id).toBe(id);
    expect(next[0]?.id).not.toBe(id);
  });

  it("filters due cards by deckId", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Filter subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const [a] = guestAddAcceptedCards(
      deckA.id,
      [{ front: "A?", back: "a" }],
      storage,
    );
    const [b] = guestAddAcceptedCards(
      deckB.id,
      [{ front: "B?", back: "b" }],
      storage,
    );
    const due = guestListDueCards({ deckId: deckA.id }, storage);
    expect(due.map((c) => c.id)).toContain(a!.id);
    expect(due.map((c) => c.id)).not.toContain(b!.id);
    expect(due.every((c) => c.deck_id === deckA.id)).toBe(true);
  });

  it("filters due cards by subjectId via deck.subject_id", () => {
    enterGuest(storage);
    const sub1 = guestCreateSubject("Subject One", storage);
    const sub2 = guestCreateSubject("Subject Two", storage);
    const deck1 = guestCreateDeck("D1", sub1.id, storage);
    const deck2 = guestCreateDeck("D2", sub2.id, storage);
    const [c1] = guestAddAcceptedCards(
      deck1.id,
      [{ front: "S1?", back: "1" }],
      storage,
    );
    const [c2] = guestAddAcceptedCards(
      deck2.id,
      [{ front: "S2?", back: "2" }],
      storage,
    );
    const due = guestListDueCards({ subjectId: sub1.id }, storage);
    expect(due.map((c) => c.id)).toContain(c1!.id);
    expect(due.map((c) => c.id)).not.toContain(c2!.id);
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
    const olderDue = guestListDueCards(undefined, storage).map((c) => c.id);
    const subject = guestCreateSubject("Paste subject", storage);
    const deck = guestCreateDeck("Paste deck", subject.id, storage);
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

    const due = guestListDueCards(undefined, storage);
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

  it("createDeckCard accepts qa and lands the id in dueIds", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Hub subject", storage);
    const deck = guestCreateDeck("Hub deck", subject.id, storage);
    const olderDue = guestListDueCards(undefined, storage).map((c) => c.id);

    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "What is ATP?", back: "Energy currency" },
      storage,
    );

    expect(card).toMatchObject({
      deck_id: deck.id,
      type: "qa",
      front: "What is ATP?",
      back: "Energy currency",
      status: "accepted",
      job_id: null,
    });
    expect(card.id.startsWith("guest-card-")).toBe(true);
    expect(card.due).toBeTruthy();

    const listed = guestListDeckCards(deck.id, storage);
    expect(listed.map((c) => c.id)).toContain(card.id);
    expect(listed.every((c) => c.status === "accepted")).toBe(true);

    const due = guestListDueCards(undefined, storage);
    expect(due[0]?.id).toBe(card.id);
    expect(due.map((c) => c.id).slice(1)).toEqual(olderDue);
  });

  it("createDeckCard allows cloze with empty Extra", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Cloze subject", storage);
    const deck = guestCreateDeck("Cloze deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      {
        type: "cloze",
        front: "The {{c1::femur}} is the thigh bone",
        back: "",
      },
      storage,
    );
    expect(card.type).toBe("cloze");
    expect(card.back).toBe("");
    expect(guestListDueCards(undefined, storage)[0]?.id).toBe(card.id);
  });

  it("createDeckCard rejects MCQ without valid options", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Mcq subject", storage);
    const deck = guestCreateDeck("Mcq deck", subject.id, storage);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        { type: "mcq", front: "Pick one", back: "A" },
        storage,
      ),
    ).toThrow(/MCQ requires options/);
  });

  it("createDeckCard rejects multi-blank cloze", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Cloze bad", storage);
    const deck = guestCreateDeck("Cloze bad deck", subject.id, storage);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        {
          type: "cloze",
          front: "The {{c1::a}} and {{c1::b}}",
          back: "",
        },
        storage,
      ),
    ).toThrow(/at most one blank/);
  });

  it("patchCard rejects invalid MCQ options", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Patch mcq", storage);
    const deck = guestCreateDeck("Patch mcq deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      {
        type: "mcq",
        front: "Pick",
        back: "A",
        options: ["A", "B", "C"],
      },
      storage,
    );
    expect(() =>
      guestPatchCard(card.id, { options: ["A", ""] }, storage),
    ).toThrow(/MCQ/);
  });

  it("patchCard updates front on an accepted card", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Edit subject", storage);
    const deck = guestCreateDeck("Edit deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Old front", back: "Keep back" },
      storage,
    );

    const patched = guestPatchCard(card.id, { front: "New front" }, storage);
    expect(patched.front).toBe("New front");
    expect(patched.back).toBe("Keep back");
    expect(patched.status).toBe("accepted");
    expect(guestListDeckCards(deck.id, storage)[0]?.front).toBe("New front");
  });

  it("moveCard updates deck_id and leaves dueIds unchanged", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Move subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const card = guestCreateDeckCard(
      deckA.id,
      { type: "qa", front: "Move me?", back: "Yes" },
      storage,
    );
    const dueBefore = guestListDueCards(undefined, storage).map((c) => c.id);

    const moved = guestMoveCard(card.id, deckB.id, storage);
    expect(moved.deck_id).toBe(deckB.id);
    expect(guestListDeckCards(deckA.id, storage).map((c) => c.id)).not.toContain(
      card.id,
    );
    expect(guestListDeckCards(deckB.id, storage).map((c) => c.id)).toContain(
      card.id,
    );
    expect(guestListDueCards(undefined, storage).map((c) => c.id)).toEqual(
      dueBefore,
    );
  });

  it("resetCardSchedule puts id at front of due and sets due now", () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Reset subject", storage);
    const deck = guestCreateDeck("Reset deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    // Bury the card at the end so reset must move it forward.
    guestReviewCard(card.id, 3, storage);
    expect(guestListDueCards(undefined, storage).at(-1)?.id).toBe(card.id);

    const before = Date.now();
    const reset = guestResetCardSchedule(card.id, storage);
    expect(reset.id).toBe(card.id);
    expect(guestListDueCards(undefined, storage)[0]?.id).toBe(card.id);
    const dueMs = Date.parse(reset.due!);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});
