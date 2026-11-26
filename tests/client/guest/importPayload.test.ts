import { describe, expect, it } from "vitest";
import { buildGuestImportPayload } from "../../../src/guest/importPayload";

const demoDeck = {
  id: "guest-deck-demo",
  title: "Guest demo deck",
  subject_id: "guest-subject-anatomy",
};

const userSubject = {
  id: "guest-subject-biology",
  title: "Biology",
};

const userDeck = {
  id: "guest-deck-aaaa-bbbb",
  title: "Paste deck",
  subject_id: userSubject.id,
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
        subjects: [{ id: demoDeck.subject_id!, title: "Anatomy" }],
        decks: [demoDeck],
        cards: [seedCard],
      }),
    ).toBeNull();
  });

  it("returns null for empty store", () => {
    expect(
      buildGuestImportPayload({ subjects: [], decks: [], cards: [] }),
    ).toBeNull();
  });

  it("skips guest-deck-demo and non-paste/non-hub cards", () => {
    const payload = buildGuestImportPayload({
      subjects: [
        { id: demoDeck.subject_id!, title: "Anatomy" },
        userSubject,
      ],
      decks: [demoDeck, userDeck],
      cards: [seedCard, pasteCard],
    });
    expect(payload).not.toBeNull();
    expect(payload!.subjects).toEqual([
      { clientId: userSubject.id, title: userSubject.title },
    ]);
    expect(payload!.decks).toEqual([
      {
        clientId: userDeck.id,
        title: userDeck.title,
        clientSubjectId: userSubject.id,
      },
    ]);
    expect(payload!.cards).toEqual([
      {
        clientDeckId: userDeck.id,
        type: "qa",
        front: pasteCard.front,
        back: pasteCard.back,
        source: "paste",
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
      subjects: [userSubject],
      decks: [userDeck],
      cards: [hubCard],
    });
    expect(payload).not.toBeNull();
    expect(payload!.cards).toEqual([
      {
        clientDeckId: userDeck.id,
        type: "qa",
        front: hubCard.front,
        back: hubCard.back,
        source: "hub",
      },
    ]);
  });

  it("includes hub cloze and mcq cards with type and options", () => {
    const hubCloze = {
      deck_id: userDeck.id,
      type: "cloze",
      front: "The {{c1::femur}}",
      back: "",
      provenance: { guest: true, source: "hub" as const },
    };
    const hubMcq = {
      deck_id: userDeck.id,
      type: "mcq",
      front: "Pick one",
      back: "B",
      options: ["A", "B", "C"],
      provenance: { guest: true, source: "hub" as const },
    };
    const payload = buildGuestImportPayload({
      subjects: [userSubject],
      decks: [userDeck],
      cards: [hubCloze, hubMcq],
    });
    expect(payload!.cards).toEqual([
      {
        clientDeckId: userDeck.id,
        type: "cloze",
        front: hubCloze.front,
        back: hubCloze.back,
        source: "hub",
      },
      {
        clientDeckId: userDeck.id,
        type: "mcq",
        front: hubMcq.front,
        back: hubMcq.back,
        options: hubMcq.options,
        source: "hub",
      },
    ]);
  });

  it("drops occlusion and image_label cards", () => {
    const occlusion = {
      deck_id: userDeck.id,
      type: "occlusion",
      front: { image_key: "img", regions: [] },
      back: "",
      provenance: { guest: true, source: "hub" as const },
    };
    const imageLabel = {
      deck_id: userDeck.id,
      type: "image_label",
      front: "Label this",
      back: "Answer",
      media_r2_keys: ["key"],
      provenance: { guest: true, source: "hub" as const },
    };
    const payload = buildGuestImportPayload({
      subjects: [userSubject],
      decks: [userDeck],
      cards: [occlusion, imageLabel, pasteCard],
    });
    expect(payload!.cards).toHaveLength(1);
    expect(payload!.cards[0]?.type).toBe("qa");
  });

  it("includes empty user guest-deck-* decks without paste cards", () => {
    const payload = buildGuestImportPayload({
      subjects: [
        { id: demoDeck.subject_id!, title: "Anatomy" },
        userSubject,
      ],
      decks: [demoDeck, userDeck],
      cards: [seedCard],
    });
    expect(payload).toEqual({
      subjects: [{ clientId: userSubject.id, title: userSubject.title }],
      decks: [
        {
          clientId: userDeck.id,
          title: userDeck.title,
          clientSubjectId: userSubject.id,
        },
      ],
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
      subjects: [userSubject],
      decks: [userDeck],
      cards,
    });
    expect(payload!.cards).toHaveLength(200);
    expect(payload!.cards[0]?.front).toBe("Q0");
    expect(payload!.cards[199]?.front).toBe("Q199");
  });

  it("excludes paste cards on the demo deck", () => {
    const payload = buildGuestImportPayload({
      subjects: [{ id: demoDeck.subject_id!, title: "Anatomy" }],
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
