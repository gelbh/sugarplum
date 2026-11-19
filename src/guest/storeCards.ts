import type { CardDraftView } from "../api/client";
import { assertSingleCloze } from "../study/clozeFormat";
import {
  mergeProvenancePagesIntoJson,
  normalizeProvenancePages,
} from "../study/notesProvenanceWrite";
import { nowIso, readStore, writeStore } from "./storePersist";
import type {
  GuestCardPatch,
  GuestHubCardBody,
  GuestListDeckCardsOpts,
  Store,
} from "./storeTypes";

/** Persist paste pairs as accepted cards; prepend ids to the due queue. */
export function guestAddAcceptedCards(
  deckId: string,
  pairs: { front: string; back: string }[],
  storage?: Store,
): CardDraftView[] {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    return [];
  }
  const created = nowIso();
  const cards: CardDraftView[] = pairs.map((p) => ({
    id: `guest-card-${crypto.randomUUID()}`,
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front: p.front,
    back: p.back,
    provenance: { guest: true, source: "paste" },
    status: "accepted",
    created_at: created,
    updated_at: created,
    due: created,
  }));
  store.cards = [...cards, ...store.cards];
  store.dueIds = [...cards.map((c) => c.id), ...store.dueIds];
  writeStore(store, storage);
  return cards;
}

/** Hub deck cards, oldest first (default accepted only). */
export function guestListDeckCards(
  deckId: string,
  storage?: Store,
  opts?: GuestListDeckCardsOpts,
): CardDraftView[] {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  const listStatus = opts?.status ?? "accepted";
  return store.cards
    .filter((c) => c.deck_id === deckId && c.status === listStatus)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Mirror worker assertValidMcqOptions for guest hub create. */
function guestAssertValidMcq(
  back: string,
  options: string[] | undefined,
): { back: string; options: string[] } {
  if (options === undefined) {
    throw new Error("MCQ requires options");
  }
  const trimmed = options.map((o) => o.trim());
  if (trimmed.length < 3 || trimmed.length > 5) {
    throw new Error("MCQ must have 3–5 options");
  }
  if (trimmed.some((o) => o.length === 0)) {
    throw new Error("MCQ options must be non-empty");
  }
  const seen = new Set<string>();
  for (const o of trimmed) {
    if (seen.has(o)) {
      throw new Error("MCQ options must be unique");
    }
    seen.add(o);
  }
  const answer = back.trim();
  if (!trimmed.includes(answer)) {
    throw new Error("MCQ back must be one of the options");
  }
  return { back: answer, options: trimmed };
}

/** Create an accepted hub card (qa|cloze|mcq) and prepend to due. */
export function guestCreateDeckCard(
  deckId: string,
  body: GuestHubCardBody,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  const allowed = new Set(["qa", "cloze", "mcq"]);
  if (!allowed.has(body.type)) {
    throw new Error("Unsupported card type");
  }
  const front = body.front.trim();
  if (!front) {
    throw new Error("Front required");
  }
  let back = body.back.trim();
  let options = body.options;
  if (body.type === "cloze") {
    assertSingleCloze(front);
    // Extra (back) may be ""
  } else if (body.type === "mcq") {
    const mcq = guestAssertValidMcq(body.back, body.options);
    back = mcq.back;
    options = mcq.options;
  } else if (body.type === "qa" && !back) {
    throw new Error("Front and back required");
  }
  const created = nowIso();
  const card: CardDraftView = {
    id: `guest-card-${crypto.randomUUID()}`,
    deck_id: deckId,
    job_id: null,
    type: body.type,
    front,
    back,
    ...(body.type === "mcq" && options ? { options } : {}),
    provenance: { guest: true, source: "hub" },
    status: "accepted",
    created_at: created,
    updated_at: created,
    due: created,
  };
  store.cards = [card, ...store.cards];
  store.dueIds = [card.id, ...store.dueIds];
  writeStore(store, storage);
  return card;
}

/** Patch content on an accepted guest card (no schedule change). */
export function guestPatchCard(
  cardId: string,
  body: GuestCardPatch,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted") {
    throw new Error("Only accepted cards can be edited");
  }
  if (
    body.front === undefined &&
    body.back === undefined &&
    body.options === undefined &&
    body.type === undefined &&
    body.provenance_pages === undefined
  ) {
    throw new Error("No fields to update");
  }
  const nextType = body.type ?? current.type;
  const nextFront = body.front !== undefined ? body.front : current.front;
  let nextBack = body.back !== undefined ? body.back : current.back;
  let nextOptions = body.options !== undefined ? body.options : current.options;

  if (nextType === "cloze" && typeof nextFront === "string") {
    assertSingleCloze(nextFront);
  }
  if (nextType === "mcq") {
    const answer =
      typeof nextBack === "string"
        ? nextBack
        : nextBack && typeof nextBack === "object" && "answer" in nextBack
          ? nextBack.answer
          : "";
    const mcq = guestAssertValidMcq(answer, nextOptions);
    nextBack = mcq.back;
    nextOptions = mcq.options;
  }

  const updated: CardDraftView = {
    ...current,
    type: nextType,
    front: nextFront,
    back: nextBack,
    updated_at: nowIso(),
  };
  if (nextType === "mcq") {
    updated.options = nextOptions;
  } else {
    delete updated.options;
  }
  if (body.provenance_pages !== undefined) {
    const pages = normalizeProvenancePages(body.provenance_pages);
    if (pages.length < 1) {
      throw new Error("provenance_pages must be a non-empty page list");
    }
    const priorJson =
      updated.provenance == null
        ? null
        : JSON.stringify(updated.provenance);
    updated.provenance = JSON.parse(
      mergeProvenancePagesIntoJson(priorJson, pages),
    ) as CardDraftView["provenance"];
  } else if (
    body.front === undefined &&
    body.back === undefined &&
    body.options === undefined &&
    body.type === undefined
  ) {
    throw new Error("No fields to update");
  }
  store.cards[idx] = updated;
  writeStore(store, storage);
  return updated;
}

/** Archive an accepted card; removes it from dueIds. */
export function guestArchiveCard(
  cardId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted") {
    throw new Error("Only accepted cards can be archived");
  }
  const updatedAt = nowIso();
  const updated: CardDraftView = {
    ...current,
    status: "archived",
    updated_at: updatedAt,
  };
  store.cards[idx] = updated;
  store.dueIds = store.dueIds.filter((id) => id !== cardId);
  writeStore(store, storage);
  return updated;
}

/** Delete an accepted card and its local schedule and review logs. */
export function guestDeleteCard(cardId: string, storage?: Store): void {
  const store = readStore(storage);
  const current = store.cards.find((c) => c.id === cardId);
  if (!current) throw new Error("Card not found");
  if (current.status !== "accepted") {
    throw new Error("Only accepted cards can be deleted");
  }
  store.cards = store.cards.filter((c) => c.id !== cardId);
  store.dueIds = store.dueIds.filter((id) => id !== cardId);
  delete store.schedules[cardId];
  store.reviewLogs = store.reviewLogs.filter((l) => l.cardId !== cardId);
  writeStore(store, storage);
}

/** Restore an archived card; prepends id to dueIds. */
export function guestRestoreCard(
  cardId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "archived") {
    throw new Error("Only archived cards can be restored");
  }
  const updatedAt = nowIso();
  const updated: CardDraftView = {
    ...current,
    status: "accepted",
    updated_at: updatedAt,
  };
  store.cards[idx] = updated;
  store.dueIds = [cardId, ...store.dueIds.filter((id) => id !== cardId)];
  writeStore(store, storage);
  return updated;
}

/** Move an accepted or archived card; dueIds unchanged. */
export function guestMoveCard(
  cardId: string,
  deckId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted" && current.status !== "archived") {
    throw new Error("Only accepted or archived cards can be moved");
  }
  if (!store.decks.some((d) => d.id === deckId)) {
    throw new Error("Deck not found");
  }
  if (deckId === current.deck_id) {
    return current;
  }
  const updatedAt = nowIso();
  const updated: CardDraftView = {
    ...current,
    deck_id: deckId,
    updated_at: updatedAt,
  };
  store.cards[idx] = updated;
  writeStore(store, storage);
  return updated;
}

/** Reset one card's due: due=now and id at front of dueIds. */
export function guestResetCardSchedule(
  cardId: string,
  storage?: Store,
): CardDraftView {
  const store = readStore(storage);
  const idx = store.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const current = store.cards[idx]!;
  if (current.status !== "accepted") {
    throw new Error("Card not found");
  }
  const due = nowIso();
  const updated: CardDraftView = { ...current, due, updated_at: due };
  store.cards[idx] = updated;
  store.dueIds = [cardId, ...store.dueIds.filter((id) => id !== cardId)];
  writeStore(store, storage);
  return updated;
}
