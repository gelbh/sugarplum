const DEMO_DECK_ID = "guest-deck-demo";
const MAX_IMPORT_CARDS = 200;

export type GuestImportStoreLike = {
  decks: { id: string; title: string }[];
  cards: {
    deck_id: string;
    front: string;
    back: string;
    provenance?: unknown;
  }[];
};

export type GuestImportPayload = {
  decks: { clientId: string; title: string }[];
  cards: { clientDeckId: string; front: string; back: string }[];
};

function isPasteProvenance(provenance: unknown): boolean {
  return (
    provenance != null &&
    typeof provenance === "object" &&
    (provenance as { source?: unknown }).source === "paste"
  );
}

/** Pure: paste cards + non-demo decks (or empty user guest-deck-*); null if seed-only/empty. */
export function buildGuestImportPayload(
  store: GuestImportStoreLike,
): GuestImportPayload | null {
  const pasteCards = store.cards
    .filter(
      (c) =>
        c.deck_id !== DEMO_DECK_ID && isPasteProvenance(c.provenance),
    )
    .slice(0, MAX_IMPORT_CARDS);

  const pasteDeckIds = new Set(pasteCards.map((c) => c.deck_id));

  const decks = store.decks.filter((d) => {
    if (d.id === DEMO_DECK_ID) return false;
    if (pasteDeckIds.has(d.id)) return true;
    return d.id.startsWith("guest-deck-");
  });

  if (decks.length === 0 && pasteCards.length === 0) return null;

  return {
    decks: decks.map((d) => ({ clientId: d.id, title: d.title })),
    cards: pasteCards.map((c) => ({
      clientDeckId: c.deck_id,
      front: c.front,
      back: c.back,
    })),
  };
}
