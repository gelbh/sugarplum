import { beforeEach, describe, expect, it } from "vitest";
import { enterGuest } from "../../../src/guest/session";
import {
  guestAddAcceptedCards,
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestListDeckCards,
  guestListDueCards,
  guestArchiveCard,
  guestDeleteCard,
  guestMoveCard,
  guestPatchCard,
  guestResetCardSchedule,
  guestRestoreCard,
  guestReviewCard,
} from "../../../src/guest/store";
import { installGuestStoreTestEnv } from "./setup";

describe("guest store", () => {
  let storage: ReturnType<typeof installGuestStoreTestEnv>["storage"];

  beforeEach(() => {
    ({ storage } = installGuestStoreTestEnv());
  });

  it("guestAddAcceptedCards writes paste cards into the due queue", async () => {
    enterGuest(storage);
    const olderDue = guestListDueCards(undefined, storage).cards.map(
      (c) => c.id,
    );
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

    const dueIds = guestListDueCards(undefined, storage).cards.map((c) => c.id);
    const newIds = added.map((c) => c.id);
    expect(dueIds).toEqual(expect.arrayContaining([...olderDue, ...newIds]));
    expect(dueIds).toHaveLength(olderDue.length + newIds.length);
  });

  it("guestAddAcceptedCards returns [] when deck is missing", async () => {
    enterGuest(storage);
    expect(
      guestAddAcceptedCards(
        "guest-deck-missing",
        [{ front: "Q?", back: "A" }],
        storage,
      ),
    ).toEqual([]);
  });

  it("createDeckCard accepts qa and lands the id in dueIds", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Hub subject", storage);
    const deck = guestCreateDeck("Hub deck", subject.id, storage);
    const olderDue = guestListDueCards(undefined, storage).cards.map(
      (c) => c.id,
    );

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

    const dueIds = guestListDueCards(undefined, storage).cards.map((c) => c.id);
    expect(dueIds).toContain(card.id);
    expect(dueIds).toEqual(expect.arrayContaining([...olderDue, card.id]));
  });

  it("createDeckCard rejects occlusion and image_label", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Image subject", storage);
    const deck = guestCreateDeck("Image deck", subject.id, storage);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        {
          type: "occlusion",
          front: "ignored",
          back: "ignored",
        } as Parameters<typeof guestCreateDeckCard>[1],
        storage,
      ),
    ).toThrow(/Unsupported card type/);
    expect(() =>
      guestCreateDeckCard(
        deck.id,
        {
          type: "image_label",
          front: "Label",
          back: "Answer",
        } as Parameters<typeof guestCreateDeckCard>[1],
        storage,
      ),
    ).toThrow(/Unsupported card type/);
  });

  it("createDeckCard allows cloze with empty Extra", async () => {
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
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toContain(card.id);
  });

  it("createDeckCard rejects MCQ without valid options", async () => {
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

  it("createDeckCard accepts multi-blank cloze", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Cloze multi", storage);
    const deck = guestCreateDeck("Cloze multi deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      {
        type: "cloze",
        front: "The {{c1::a}} and {{c2::b}}",
        back: "",
      },
      storage,
    );
    expect(card.front).toBe("The {{c1::a}} and {{c2::b}}");
  });

  it("patchCard rejects invalid MCQ options", async () => {
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

  it("patchCard updates front on an accepted card", async () => {
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

  it("archiveCard sets archived and removes id from due list", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Archive subject", storage);
    const deck = guestCreateDeck("Archive deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Archive me?", back: "Yes" },
      storage,
    );
    expect(
      guestListDueCards(undefined, storage).cards.some((c) => c.id === card.id),
    ).toBe(true);

    const archived = guestArchiveCard(card.id, storage);
    expect(archived.status).toBe("archived");
    expect(guestListDeckCards(deck.id, storage).map((c) => c.id)).not.toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.some((c) => c.id === card.id),
    ).toBe(false);
  });

  it("restoreCard sets accepted and returns card to the due queue", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Restore subject", storage);
    const deck = guestCreateDeck("Restore deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Restore me?", back: "Yes" },
      storage,
    );
    guestArchiveCard(card.id, storage);

    const restored = guestRestoreCard(card.id, storage);
    expect(restored.status).toBe("accepted");
    expect(guestListDeckCards(deck.id, storage).map((c) => c.id)).toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toContain(card.id);
  });

  it("moveCard updates deck_id and leaves dueIds unchanged", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Move subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const card = guestCreateDeckCard(
      deckA.id,
      { type: "qa", front: "Move me?", back: "Yes" },
      storage,
    );
    const dueBefore = guestListDueCards(undefined, storage).cards.map(
      (c) => c.id,
    );

    const moved = guestMoveCard(card.id, deckB.id, storage);
    expect(moved.deck_id).toBe(deckB.id);
    expect(
      guestListDeckCards(deckA.id, storage).map((c) => c.id),
    ).not.toContain(card.id);
    expect(guestListDeckCards(deckB.id, storage).map((c) => c.id)).toContain(
      card.id,
    );
    // Membership stays; deck interleave may reorder after deck_id changes.
    expect(
      guestListDueCards(undefined, storage)
        .cards.map((c) => c.id)
        .sort(),
    ).toEqual([...dueBefore].sort());
  });

  it("moveCard allows archived cards", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Move arch subject", storage);
    const deckA = guestCreateDeck("Deck A", subject.id, storage);
    const deckB = guestCreateDeck("Deck B", subject.id, storage);
    const card = guestCreateDeckCard(
      deckA.id,
      { type: "qa", front: "Archived move?", back: "Yes" },
      storage,
    );
    guestArchiveCard(card.id, storage);

    const moved = guestMoveCard(card.id, deckB.id, storage);
    expect(moved.deck_id).toBe(deckB.id);
    expect(moved.status).toBe("archived");
  });

  it("resetCardSchedule sets due now and keeps card in the due queue", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Reset subject", storage);
    const deck = guestCreateDeck("Reset deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Q?", back: "A" },
      storage,
    );
    await guestReviewCard(card.id, 3, storage);

    const before = Date.now();
    const reset = guestResetCardSchedule(card.id, storage);
    expect(reset.id).toBe(card.id);
    expect(
      guestListDueCards(undefined, storage).cards.map((c) => c.id),
    ).toContain(card.id);
    const dueMs = Date.parse(reset.due!);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("deleteCard removes the card, schedule, review log, and due id", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Delete subject", storage);
    const deck = guestCreateDeck("Delete deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Gone?", back: "Yes" },
      storage,
    );
    await guestReviewCard(card.id, 3, storage);

    guestDeleteCard(card.id, storage);

    expect(guestListDeckCards(deck.id, storage).map((c) => c.id)).not.toContain(
      card.id,
    );
    expect(
      guestListDueCards(undefined, storage).cards.some((c) => c.id === card.id),
    ).toBe(false);
    const raw = storage.getItem("sugarplum.guest.store.v1");
    const parsed = JSON.parse(raw ?? "{}") as {
      schedules?: Record<string, unknown>;
      reviewLogs?: { cardId: string }[];
    };
    expect(parsed.schedules?.[card.id]).toBeUndefined();
    expect(parsed.reviewLogs?.some((l) => l.cardId === card.id)).toBe(false);
  });

  it("deleteCard rejects a non-accepted card", async () => {
    enterGuest(storage);
    const subject = guestCreateSubject("Delete subject", storage);
    const deck = guestCreateDeck("Delete deck", subject.id, storage);
    const card = guestCreateDeckCard(
      deck.id,
      { type: "qa", front: "Keep", back: "Yes" },
      storage,
    );
    guestArchiveCard(card.id, storage);
    expect(() => guestDeleteCard(card.id, storage)).toThrow(
      /Only accepted cards can be deleted/,
    );
  });
});
