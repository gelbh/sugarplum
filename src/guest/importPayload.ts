const DEMO_DECK_ID = "guest-deck-demo";
const MAX_IMPORT_CARDS = 200;

const IMPORTABLE_CARD_TYPES = new Set(["qa", "cloze", "mcq"]);

export type GuestImportStoreLike = {
  subjects?: { id: string; title: string }[];
  decks: { id: string; title: string; subject_id?: string }[];
  cards: {
    deck_id: string;
    front: unknown;
    back: unknown;
    type?: string;
    options?: string[];
    provenance?: unknown;
  }[];
};

export type GuestImportCardType = "qa" | "cloze" | "mcq";
export type GuestImportSource = "paste" | "hub";

export type GuestImportPayload = {
  subjects: { clientId: string; title: string }[];
  decks: { clientId: string; title: string; clientSubjectId: string }[];
  cards: {
    clientDeckId: string;
    type: GuestImportCardType;
    front: string;
    back: string;
    options?: string[];
    source: GuestImportSource;
  }[];
};

type ImportableStoreCard = {
  deck_id: string;
  type: GuestImportCardType;
  front: string;
  back: string;
  options?: string[];
  source: GuestImportSource;
};

function isImportableProvenance(
  provenance: unknown,
): provenance is { source: GuestImportSource } {
  if (provenance == null || typeof provenance !== "object") return false;
  const source = (provenance as { source?: unknown }).source;
  return source === "paste" || source === "hub";
}

function resolveImportType(type: string | undefined): GuestImportCardType | null {
  if (type === undefined) return "qa";
  return IMPORTABLE_CARD_TYPES.has(type) ? (type as GuestImportCardType) : null;
}

/** Pure: paste/hub text DIY cards + non-demo decks (or empty user guest-deck-*); null if seed-only/empty. */
export function buildGuestImportPayload(
  store: GuestImportStoreLike,
): GuestImportPayload | null {
  const importCards: ImportableStoreCard[] = [];
  for (const c of store.cards) {
    if (c.deck_id === DEMO_DECK_ID) continue;
    if (!isImportableProvenance(c.provenance)) continue;
    const cardType = resolveImportType(c.type);
    if (cardType == null) continue;
    if (typeof c.front !== "string" || typeof c.back !== "string") continue;
    importCards.push({
      deck_id: c.deck_id,
      type: cardType,
      front: c.front,
      back: c.back,
      ...(cardType === "mcq" && c.options?.length
        ? { options: c.options }
        : {}),
      source: c.provenance.source,
    });
    if (importCards.length >= MAX_IMPORT_CARDS) break;
  }

  const importDeckIds = new Set(importCards.map((c) => c.deck_id));

  const decks = store.decks.filter((d) => {
    if (d.id === DEMO_DECK_ID) return false;
    if (importDeckIds.has(d.id)) return true;
    return d.id.startsWith("guest-deck-");
  });

  if (decks.length === 0 && importCards.length === 0) return null;

  const subjectIds = new Set<string>();
  for (const d of decks) {
    if (d.subject_id) subjectIds.add(d.subject_id);
  }

  const subjects = (store.subjects ?? [])
    .filter((s) => subjectIds.has(s.id))
    .map((s) => ({ clientId: s.id, title: s.title }));

  return {
    subjects,
    decks: decks.map((d) => ({
      clientId: d.id,
      title: d.title,
      clientSubjectId: d.subject_id ?? "",
    })),
    cards: importCards.map((c) => ({
      clientDeckId: c.deck_id,
      type: c.type,
      front: c.front,
      back: c.back,
      ...(c.options ? { options: c.options } : {}),
      source: c.source,
    })),
  };
}
