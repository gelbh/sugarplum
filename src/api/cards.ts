import { isGuest } from "../guest/session";
import {
  guestArchiveCard,
  guestDeleteCard,
  guestMoveCard,
  guestPatchCard,
  guestRestoreCard,
} from "../guest/store";
import type { RejectReason } from "../draftReview/kernel";
import { clearDueCache } from "../study/kernel";
import { api, ApiError, guestUnsupported } from "./core";
import { notifyGamificationChanged } from "./events";
import type {
  AcceptCardResult,
  CardDraftView,
  CardType,
  OcclusionFrontView,
} from "./types";

export function patchCard(
  cardId: string,
  body: {
    front?: string | OcclusionFrontView;
    back?: string | { answer: string };
    options?: string[];
    type?: CardType;
    provenance_pages?: number[];
  },
) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestPatchCard(cardId, body));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(message === "Card not found" ? 404 : 400, message);
    }
  }
  return api<CardDraftView>(`/api/cards/${cardId}`, {
    method: "PATCH",
    json: body,
  });
}

/** Pages-only PATCH; keeps excerpt and other provenance keys. */
export function patchCardProvenancePages(cardId: string, pages: number[]) {
  return patchCard(cardId, { provenance_pages: pages });
}

export function acceptCard(cardId: string) {
  if (isGuest()) guestUnsupported("accept cards");
  return api<AcceptCardResult>(`/api/cards/${cardId}/accept`, {
    method: "POST",
  }).then(notifyGamificationChanged);
}
export function rejectCard(cardId: string, reason?: RejectReason | null) {
  if (isGuest()) guestUnsupported("reject cards");
  return api<CardDraftView>(`/api/cards/${cardId}/reject`, {
    method: "POST",
    ...(reason ? { json: { reason } } : {}),
  });
}

/** Undo accept or reject: restore the card as a draft. */
export async function undoReviewCard(cardId: string) {
  if (isGuest()) guestUnsupported("undo card review");
  const card = await api<CardDraftView>(`/api/cards/${cardId}/undo-review`, {
    method: "POST",
  });
  clearDueCache();
  return card;
}

export async function moveCard(cardId: string, deckId: string) {
  if (isGuest()) {
    try {
      return guestMoveCard(cardId, deckId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(
        message === "Card not found" || message === "Deck not found"
          ? 404
          : 400,
        message,
      );
    }
  }
  const card = await api<CardDraftView>(`/api/cards/${cardId}/move`, {
    method: "POST",
    json: { deckId },
  });
  clearDueCache();
  return card;
}

export async function archiveCard(cardId: string) {
  if (isGuest()) {
    try {
      return guestArchiveCard(cardId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(message === "Card not found" ? 404 : 400, message);
    }
  }
  const card = await api<CardDraftView>(`/api/cards/${cardId}/archive`, {
    method: "POST",
  });
  clearDueCache();
  return card;
}

export async function deleteCard(cardId: string): Promise<void> {
  if (isGuest()) {
    try {
      guestDeleteCard(cardId);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(message === "Card not found" ? 404 : 400, message);
    }
  }
  await api<void>(`/api/cards/${cardId}`, { method: "DELETE" });
  clearDueCache();
}

export async function restoreCard(cardId: string) {
  if (isGuest()) {
    try {
      return guestRestoreCard(cardId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(message === "Card not found" ? 404 : 400, message);
    }
  }
  const card = await api<CardDraftView>(`/api/cards/${cardId}/restore`, {
    method: "POST",
  });
  clearDueCache();
  return card;
}
