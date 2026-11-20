import { isGuest } from "../guest/session";
import {
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestDeckStats,
  guestDeleteDeck,
  guestDeleteSubject,
  guestListDeckCards,
  guestListDecks,
  guestListSubjects,
  guestPatchDeck,
  guestPatchSubject,
  guestResetCardSchedule,
  type GuestHubCardBody,
} from "../guest/store";
import {
  guestDeckComposition,
  guestSubjectComposition,
  guestSubjectCompositionSummaries,
} from "../guest/composition";
import { api, ApiError, guestUnsupported } from "./core";
import type {
  CardDraftView,
  ClaimCoverage,
  CoverFields,
  CoverOwnerKind,
  CoverUploadUrlResponse,
  Deck,
  DeckStats,
  HubCreateCardBody,
  ListDeckCardsOpts,
  MaterialListItem,
  StoredCoverRow,
  Subject,
} from "./types";
import type { SubjectKnowledge } from "../study/subjectKnowledge";
import type { SubjectCompositionSummary } from "../guest/composition";

function rejectGuestCover(): never {
  throw new Error("Sign in to choose a cover");
}

function isGuestHubCardBody(body: HubCreateCardBody): body is GuestHubCardBody {
  return body.type === "qa" || body.type === "cloze" || body.type === "mcq";
}

export function listDeckMaterials(deckId: string) {
  if (isGuest()) return Promise.resolve([] as MaterialListItem[]);
  return api<MaterialListItem[]>(`/api/decks/${deckId}/materials`);
}

export function listMaterials() {
  if (isGuest()) return Promise.resolve([] as MaterialListItem[]);
  return api<MaterialListItem[]>("/api/materials");
}

export function deleteMaterial(materialId: string) {
  if (isGuest()) guestUnsupported("delete materials");
  return api<void>(`/api/materials/${materialId}`, { method: "DELETE" });
}

/** Session-gated download URL for an owned material. */
export function downloadMaterialUrl(materialId: string): string {
  if (isGuest()) guestUnsupported("download materials");
  return `/api/materials/${materialId}/download`;
}

export function listSubjects() {
  if (isGuest()) return Promise.resolve(guestListSubjects());
  return api<Subject[]>("/api/subjects");
}

export function searchCovers(query: string, page = 1) {
  if (isGuest()) rejectGuestCover();
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return api<{
    photos: CoverFields[];
    page: number;
    totalPages: number;
  }>(`/api/covers/search?q=${encodeURIComponent(query)}&page=${safePage}`);
}

export function listCovers() {
  if (isGuest()) rejectGuestCover();
  return api<{ covers: StoredCoverRow[] }>("/api/covers").then(
    (body) => body.covers,
  );
}

export function setCover(
  ownerKind: CoverOwnerKind,
  ownerId: string,
  photoId: string,
) {
  if (isGuest()) rejectGuestCover();
  return api<StoredCoverRow>("/api/covers", {
    method: "PUT",
    json: { ownerKind, ownerId, photoId },
  });
}

export function setCustomCover(
  ownerKind: CoverOwnerKind,
  ownerId: string,
  r2Key: string,
  photoId?: string,
) {
  if (isGuest()) rejectGuestCover();
  return api<StoredCoverRow>("/api/covers/custom", {
    method: "PUT",
    json: { ownerKind, ownerId, r2Key, photoId },
  });
}

export function requestCoverUploadUrl(
  ownerKind: CoverOwnerKind,
  ownerId: string,
  opts: { contentType: string; size: number },
) {
  if (isGuest()) rejectGuestCover();
  return api<CoverUploadUrlResponse>("/api/covers/upload-url", {
    method: "POST",
    json: {
      ownerKind,
      ownerId,
      contentType: opts.contentType,
      size: opts.size,
    },
  });
}

export async function uploadCoverFile(
  ownerKind: CoverOwnerKind,
  ownerId: string,
  file: File,
) {
  if (isGuest()) rejectGuestCover();
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"] as const;
  if (!allowedTypes.includes(file.type as (typeof allowedTypes)[number])) {
    throw new Error("Cover must be a JPEG, PNG, or WebP image");
  }
  const contentType = file.type;
  const { imageId, uploadUrl, r2Key } = await requestCoverUploadUrl(
    ownerKind,
    ownerId,
    { contentType, size: file.size },
  );
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.size),
    },
    body: file,
  });
  if (!put.ok) {
    throw new ApiError(put.status, "Failed to upload cover image");
  }
  return setCustomCover(ownerKind, ownerId, r2Key, imageId);
}

export function clearCover(ownerKind: CoverOwnerKind, ownerId: string) {
  if (isGuest()) rejectGuestCover();
  return api<void>("/api/covers", {
    method: "DELETE",
    json: { ownerKind, ownerId },
  });
}

export function createSubject(title: string) {
  if (isGuest()) return Promise.resolve(guestCreateSubject(title));
  return api<Subject>("/api/subjects", {
    method: "POST",
    json: { title },
  });
}

export function patchSubject(id: string, title: string) {
  if (isGuest()) return Promise.resolve(guestPatchSubject(id, title));
  return api<Subject>(`/api/subjects/${id}`, {
    method: "PATCH",
    json: { title },
  });
}

/** Guest: throws ApiError 409 when decks remain (message "Subject still has decks"). */
export function deleteSubject(id: string) {
  if (isGuest()) {
    try {
      guestDeleteSubject(id);
      return Promise.resolve(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      if (message === "Subject still has decks") {
        throw new ApiError(409, message);
      }
      throw new ApiError(404, message);
    }
  }
  return api<void>(`/api/subjects/${id}`, { method: "DELETE" });
}

export function listDecks(subjectId?: string) {
  if (isGuest()) return Promise.resolve(guestListDecks(subjectId));
  const q = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  return api<Deck[]>(`/api/decks${q}`);
}

export function createDeck(title: string, subjectId: string) {
  if (isGuest()) return Promise.resolve(guestCreateDeck(title, subjectId));
  return api<Deck>("/api/decks", {
    method: "POST",
    json: { title, subjectId },
  });
}

export function patchDeck(id: string, title: string) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestPatchDeck(id, title));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Deck not found",
      );
    }
  }
  return api<Deck>(`/api/decks/${id}`, {
    method: "PATCH",
    json: { title },
  });
}

export function deleteDeck(id: string) {
  if (isGuest()) {
    try {
      guestDeleteDeck(id);
      return Promise.resolve(undefined);
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Deck not found",
      );
    }
  }
  return api<void>(`/api/decks/${id}`, { method: "DELETE" });
}

export function deckStats(id: string) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestDeckStats(id));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Deck not found",
      );
    }
  }
  return api<DeckStats>(`/api/decks/${id}/stats`);
}

export function getDeckClaimCoverage(
  deckId: string,
  init?: RequestInit,
): Promise<ClaimCoverage | null> {
  if (isGuest()) return Promise.resolve(null);
  return api<ClaimCoverage>(`/api/decks/${deckId}/claim-coverage`, init);
}

export type DeckHygieneCard = {
  id: string;
  type: string;
  front_preview: string;
  reasons: string[];
  regen_op?: { id: string; status: "queued" | "running" };
};

export type DeckHygiene = {
  cards: DeckHygieneCard[];
  summary: { flagged: number };
};

export function getDeckHygiene(deckId: string) {
  if (isGuest()) {
    return Promise.resolve({ cards: [], summary: { flagged: 0 } });
  }
  return api<DeckHygiene>(`/api/decks/${deckId}/hygiene`);
}

export function subjectComposition(id: string) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestSubjectComposition(id));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Subject not found",
      );
    }
  }
  return api<SubjectKnowledge>(`/api/subjects/${id}/composition`);
}

export function getDeckComposition(deckId: string) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestDeckComposition(deckId));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Deck not found",
      );
    }
  }
  return api<SubjectKnowledge>(`/api/decks/${deckId}/composition`);
}

export function listSubjectCompositionSummaries() {
  if (isGuest()) {
    try {
      return Promise.resolve(guestSubjectCompositionSummaries());
    } catch {
      return Promise.resolve([]);
    }
  }
  return api<SubjectCompositionSummary[]>(
    `/api/subjects/composition-summaries`,
  );
}

export function listDeckCards(deckId: string, opts?: ListDeckCardsOpts) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestListDeckCards(deckId, undefined, opts));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Deck not found",
      );
    }
  }
  const q = opts?.status === "archived" ? "?status=archived" : "";
  return api<CardDraftView[]>(`/api/decks/${deckId}/cards${q}`);
}

export function createDeckCard(deckId: string, body: HubCreateCardBody) {
  if (isGuest()) {
    try {
      if (!isGuestHubCardBody(body)) {
        throw new Error("Unsupported card type");
      }
      return Promise.resolve(guestCreateDeckCard(deckId, body));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deck not found";
      throw new ApiError(message === "Deck not found" ? 404 : 400, message);
    }
  }
  return api<CardDraftView>(`/api/decks/${deckId}/cards`, {
    method: "POST",
    json: body,
  });
}

export function resetCardSchedule(cardId: string) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestResetCardSchedule(cardId));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Card not found",
      );
    }
  }
  return api<CardDraftView>(`/api/cards/${cardId}/reset-schedule`, {
    method: "POST",
  });
}
