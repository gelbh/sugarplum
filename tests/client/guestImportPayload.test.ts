import { describe, expect, it } from "vitest";
import { buildGuestImportPayload } from "../../src/guest/importPayload";

const demoDeck = {
  id: "guest-deck-demo",
  title: "Guest demo deck",
};

const userDeck = {
  id: "guest-deck-aaaa-bbbb",
  title: "Paste deck",
};

const seedCard = {
  deck_id: "guest-deck-demo",
  front: "Seed Q",
  back: "Seed A",
  provenance: { guest: true },
};

const pasteCard = {
  deck_id: userDeck.id,
  front: "What is osmosis?",
  back: "Diffusion of water",
  provenance: { guest: true, source: "paste" as const },
};

describe("buildGuestImportPayload", () => {
  it("returns null for seed-only store", () => {
    expect(
      buildGuestImportPayload({
        decks: [demoDeck],
        cards: [seedCard],
      }),
    ).toBeNull();
  });

  it("returns null for empty store", () => {
    expect(buildGuestImportPayload({ decks: [], cards: [] })).toBeNull();
  });

  it("skips guest-deck-demo and non-paste/non-hub cards", () => {
    const payload = buildGuestImportPayload({
      decks: [demoDeck, userDeck],
      cards: [seedCard, pasteCard],
    });
    expect(payload).not.toBeNull();
    expect(payload!.decks).toEqual([
      { clientId: userDeck.id, title: userDeck.title },
    ]);
    expect(payload!.cards).toEqual([
      {
        clientDeckId: userDeck.id,
        front: pasteCard.front,
        back: pasteCard.back,
      },
    ]);
  });

  it("includes hub DIY qa cards in the import payload", () => {
    const hubCard = {
      deck_id: userDeck.id,
      type: "qa",
      front: "What is ATP?",
      back: "Energy currency",
      provenance: { guest: true, source: "hub" as const },
    };
    const payload = buildGuestImportPayload({
      decks: [userDeck],
      cards: [hubCard],
    });
    expect(payload).not.toBeNull();
    expect(payload!.cards).toEqual([
      {
        clientDeckId: userDeck.id,
        front: hubCard.front,
        back: hubCard.back,
      },
    ]);
  });

  it("skips hub cloze/mcq until typed merge exists", () => {
    const hubCloze = {
      deck_id: userDeck.id,
      type: "cloze",
      front: "The {{c1::femur}}",
      back: "",
      provenance: { guest: true, source: "hub" as const },
    };
    const payload = buildGuestImportPayload({
      decks: [userDeck],
      cards: [hubCloze],
    });
    expect(payload).toEqual({
      decks: [{ clientId: userDeck.id, title: userDeck.title }],
      cards: [],
    });
  });

  it("includes empty user guest-deck-* decks without paste cards", () => {
    const payload = buildGuestImportPayload({
      decks: [demoDeck, userDeck],
      cards: [seedCard],
    });
    expect(payload).toEqual({
      decks: [{ clientId: userDeck.id, title: userDeck.title }],
      cards: [],
    });
  });

  it("caps paste cards at 200", () => {
    const cards = Array.from({ length: 205 }, (_, i) => ({
      deck_id: userDeck.id,
      front: `Q${i}`,
      back: `A${i}`,
      provenance: { guest: true, source: "paste" as const },
    }));
    const payload = buildGuestImportPayload({
      decks: [userDeck],
      cards,
    });
    expect(payload!.cards).toHaveLength(200);
    expect(payload!.cards[0]?.front).toBe("Q0");
    expect(payload!.cards[199]?.front).toBe("Q199");
  });

  it("excludes paste cards on the demo deck", () => {
    const payload = buildGuestImportPayload({
      decks: [demoDeck],
      cards: [
        {
          deck_id: "guest-deck-demo",
          front: "Pasted on demo",
          back: "A",
          provenance: { guest: true, source: "paste" },
        },
      ],
    });
    expect(payload).toBeNull();
  });
});
