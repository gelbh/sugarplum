const DEMO_DECK_ID = "guest-deck-demo";
const MAX_IMPORT_CARDS = 200;

export type GuestImportStoreLike = {
  decks: { id: string; title: string }[];
  /** Guest store cards may include non-string fronts (occlusion); paste QA are strings. */
  cards: {
    deck_id: string;
    front: unknown;
    back: unknown;
    /** Present on guest store cards; import API is still QA-only. */
    type?: string;
    provenance?: unknown;
  }[];
};

export type GuestImportPayload = {
  decks: { clientId: string; title: string }[];
  cards: { clientDeckId: string; front: string; back: string }[];
};

/** Paste and hub DIY string cards are importable; cloze/MCQ typed merge still parked. */
function isImportableProvenance(provenance: unknown): boolean {
  if (provenance == null || typeof provenance !== "object") return false;
  const source = (provenance as { source?: unknown }).source;
  return source === "paste" || source === "hub";
}

/** Pure: paste/hub cards + non-demo decks (or empty user guest-deck-*); null if seed-only/empty. */
export function buildGuestImportPayload(
  store: GuestImportStoreLike,
): GuestImportPayload | null {
  const importCards = store.cards
    .filter(
      (c): c is {
        deck_id: string;
        front: string;
        back: string;
        type?: string;
        provenance?: unknown;
      } =>
        c.deck_id !== DEMO_DECK_ID &&
        isImportableProvenance(c.provenance) &&
        typeof c.front === "string" &&
        typeof c.back === "string" &&
        // Guest import API still inserts type "qa" only; cloze/MCQ merge parked.
        (c.type === undefined || c.type === "qa"),
    )
    .slice(0, MAX_IMPORT_CARDS);

  const importDeckIds = new Set(importCards.map((c) => c.deck_id));

  const decks = store.decks.filter((d) => {
    if (d.id === DEMO_DECK_ID) return false;
    if (importDeckIds.has(d.id)) return true;
    return d.id.startsWith("guest-deck-");
  });

  if (decks.length === 0 && importCards.length === 0) return null;

  return {
    decks: decks.map((d) => ({ clientId: d.id, title: d.title })),
    cards: importCards.map((c) => ({
      clientDeckId: c.deck_id,
      front: c.front,
      back: c.back,
    })),
  };
}
