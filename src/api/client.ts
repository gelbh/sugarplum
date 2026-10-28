import {
  UploadError,
  uploadWithProgress,
} from "../progress/uploadWithProgress";
import { endGuestLocal } from "../guest/endGuestLocal";
import {
  clearGuestMergeArtifacts,
  tryMergeGuestAfterAuth,
} from "../guest/mergeOnAuth";
import type { GuestImportPayload } from "../guest/importPayload";
import { GUEST_USER, isGuest } from "../guest/session";
import {
  ensureGuestStore,
  guestCreateDeck,
  guestCreateDeckCard,
  guestCreateSubject,
  guestDeckStats,
  guestDeleteDeck,
  guestDeleteSubject,
  guestJourney,
  guestListDeckCards,
  guestListDecks,
  guestListDueCards,
  guestListSubjects,
  guestPatchCard,
  guestPatchDeck,
  guestPatchSubject,
  guestResetCardSchedule,
  guestReviewCard,
  type GuestHubCardBody,
} from "../guest/store";
import { clearDueCache } from "../study/dueCache";
import { clearPendingGrades } from "../study/pendingGrades";
import { STUDY_MEDIA_CACHE } from "../study/studyMediaCache";

export type ApiErrorBody = {
  error?: string;
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function guestUnsupported(action: string): never {
  throw new ApiError(403, `Guest mode is local-only. Sign in to ${action}.`);
}

/** JSON fetch helper; always sends cookies for session auth. */
export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    body,
    credentials: "include",
  });

  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const data = (await res.json()) as ApiErrorBody;
      message = data.message ?? data.error ?? message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type AuthUser = {
  id: string;
  email: string;
  google_linked?: boolean;
};

export function importGuestLocal(body: GuestImportPayload) {
  return api<{ deckCount: number; cardCount: number }>("/api/guest/import", {
    method: "POST",
    json: body,
  });
}

export async function register(email: string, password: string) {
  const user = await api<AuthUser>("/api/auth/register", {
    method: "POST",
    json: { email, password },
  });
  await tryMergeGuestAfterAuth({ importGuest: importGuestLocal });
  return user;
}

export async function login(email: string, password: string) {
  const user = await api<AuthUser>("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });
  await tryMergeGuestAfterAuth({ importGuest: importGuestLocal });
  return user;
}

export async function logout() {
  if (isGuest()) {
    endGuestLocal();
    return { ok: true };
  }
  const result = await api<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
  clearDueCache();
  clearPendingGrades();
  clearGuestMergeArtifacts();
  if (typeof caches !== "undefined") {
    try {
      await caches.delete(STUDY_MEDIA_CACHE);
    } catch {
      /* Cache API missing / denied */
    }
  }
  return result;
}

export function me() {
  if (isGuest()) {
    ensureGuestStore();
    return Promise.resolve({ ...GUEST_USER });
  }
  return api<AuthUser>("/api/auth/me");
}

export type Subject = {
  id: string;
  title: string;
  created_at: string;
  deck_count?: number;
};

export type Deck = {
  id: string;
  title: string;
  subject_id: string;
  /** Unused after hierarchy migrate; kept optional for compat. */
  subject_hint?: string | null;
  created_at: string;
};

export type DeckStats = {
  accepted: number;
  draft: number;
  materials: number;
};

export type Material = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
};

export function listSubjects() {
  if (isGuest()) return Promise.resolve(guestListSubjects());
  return api<Subject[]>("/api/subjects");
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

export function listDeckCards(deckId: string) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestListDeckCards(deckId));
    } catch (err) {
      throw new ApiError(
        404,
        err instanceof Error ? err.message : "Deck not found",
      );
    }
  }
  return api<CardDraftView[]>(`/api/decks/${deckId}/cards`);
}

export function createDeckCard(deckId: string, body: GuestHubCardBody) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestCreateDeckCard(deckId, body));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deck not found";
      throw new ApiError(
        message === "Deck not found" ? 404 : 400,
        message,
      );
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
export type PasteMaterialResponse = Material & { jobId: string };

export function pasteMaterial(
  deckId: string,
  body: { text: string; filename?: string },
) {
  if (isGuest()) guestUnsupported("generate cards from materials");
  return api<PasteMaterialResponse>(`/api/decks/${deckId}/materials/paste`, {
    method: "POST",
    json: body,
  });
}

export type GenerationJobProgress = {
  stage: string;
  current: number;
  total: number;
  percent: number;
  label: string;
  tokens_used?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  drafts_so_far?: number;
  events?: {
    at: string;
    kind: "excerpt" | "draft" | "stage";
    stage: string;
    text: string;
  }[];
  path?: "free" | "byo";
};

export type GenerationJob = {
  id: string;
  material_id: string;
  status: string;
  error: string | null;
  coverage_json: string | null;
  progress: GenerationJobProgress | null;
  free_quota: { used: number; cap: number; remaining: number } | null;
  created_at: string;
  finished_at: string | null;
};

export function getJob(jobId: string) {
  if (isGuest()) guestUnsupported("view generation jobs");
  return api<GenerationJob>(`/api/jobs/${jobId}`);
}

/** Wipe all job cards (including accepted), reset to queued, and requeue generation. */
export function regenJob(jobId: string) {
  if (isGuest()) guestUnsupported("regenerate cards");
  return api<GenerationJob>(`/api/jobs/${jobId}/regen`, { method: "POST" });
}

/** Soft-clean: reject remaining drafts only; accepted cards stay. No requeue. */
export function rejectJobDrafts(jobId: string) {
  if (isGuest()) guestUnsupported("reject remaining drafts");
  return api<{ rejectedCount: number }>(`/api/jobs/${jobId}/reject-drafts`, {
    method: "POST",
  });
}

export type JobListItem = {
  id: string;
  status: string;
  draft_count: number;
  deck_id: string;
  deck_title: string;
  filename: string | null;
  created_at: string;
};

/** Owner jobs that still have draft cards (newest first). */
export function listJobsWithDrafts() {
  if (isGuest()) return Promise.resolve([]);
  return api<JobListItem[]>("/api/jobs");
}

export type UploadUrlResponse = {
  materialId: string;
  uploadUrl: string;
  r2Key: string;
};

export function requestMaterialUploadUrl(
  deckId: string,
  body: { filename: string; contentType: string; size: number },
) {
  if (isGuest()) guestUnsupported("upload materials");
  return api<UploadUrlResponse>(`/api/decks/${deckId}/materials/upload-url`, {
    method: "POST",
    json: body,
  });
}

export function presignPdfFigure(
  pdfMaterialId: string,
  body: {
    filename: string;
    contentType: "image/png";
    size: number;
    index: number;
  },
) {
  if (isGuest()) guestUnsupported("upload PDF figure crops");
  return api<UploadUrlResponse>(
    `/api/materials/${pdfMaterialId}/figures/presign`,
    {
      method: "POST",
      json: body,
    },
  );
}

export type CompleteMaterialResponse = Material & { jobId: string | null };

export type FigureExtractMode = "fast" | "accurate";

export function completeMaterial(
  materialId: string,
  opts?: { figureExtractMode?: FigureExtractMode },
) {
  if (isGuest()) guestUnsupported("complete material uploads");
  return api<CompleteMaterialResponse>(
    `/api/materials/${materialId}/complete`,
    {
      method: "POST",
      ...(opts?.figureExtractMode !== undefined
        ? { json: { figureExtractMode: opts.figureExtractMode } }
        : {}),
    },
  );
}

export type LlmSettingsConfigured = {
  provider: string;
  last4: string;
  configured: true;
};

export type LlmSettingsMissing = {
  configured: false;
};

export type LlmSettings = LlmSettingsConfigured | LlmSettingsMissing;

export function getLlmSettings() {
  if (isGuest()) {
    const missing: LlmSettingsMissing = { configured: false };
    return Promise.resolve(missing);
  }
  return api<LlmSettings>("/api/settings/llm");
}

export function putLlmSettings(provider: string, apiKey: string) {
  if (isGuest()) guestUnsupported("save LLM settings");
  return api<LlmSettingsConfigured>("/api/settings/llm", {
    method: "PUT",
    json: { provider, apiKey },
  });
}

/** Occlusion front payload stored in front_json (normalized region boxes). */
export type OcclusionFrontView = {
  image_key: string;
  prompt?: string;
  regions: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  }>;
  mode: "hide_one";
};

export type CardType =
  "qa" | "cloze" | "image_label" | "diagram" | "mcq" | "occlusion";

export type CardDraftView = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: CardType | string;
  front: string | OcclusionFrontView;
  back: string | { answer: string };
  options?: string[];
  media_r2_keys?: string[];
  provenance: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  due?: string;
};

/** Session-gated media URL for an owned R2 object key. */
export function mediaUrl(r2Key: string): string {
  return `/api/materials/media?key=${encodeURIComponent(r2Key)}`;
}

export function listJobDrafts(jobId: string) {
  if (isGuest()) guestUnsupported("review draft cards");
  return api<CardDraftView[]>(`/api/jobs/${jobId}/drafts`);
}

export type JourneyStatus = {
  deckCount: number;
  hasGenerationJob: boolean;
  openReviewJobId: string | null;
  /** Latest queued/running/failed job; Review stays incomplete until settled. */
  pendingGenerationJobId: string | null;
  acceptedCount: number;
  dueCount: number;
};

export function getJourney() {
  if (isGuest()) return Promise.resolve(guestJourney());
  return api<JourneyStatus>("/api/journey");
}

export function patchCard(
  cardId: string,
  body: {
    front?: string | OcclusionFrontView;
    back?: string | { answer: string };
    options?: string[];
    type?: CardType;
  },
) {
  if (isGuest()) {
    try {
      return Promise.resolve(guestPatchCard(cardId, body));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(
        message === "Card not found" ? 404 : 400,
        message,
      );
    }
  }
  return api<CardDraftView>(`/api/cards/${cardId}`, {
    method: "PATCH",
    json: body,
  });
}

export function acceptCard(cardId: string) {
  if (isGuest()) guestUnsupported("accept cards");
  return api<CardDraftView>(`/api/cards/${cardId}/accept`, { method: "POST" });
}

export function acceptAllJobDrafts(jobId: string) {
  if (isGuest()) guestUnsupported("accept cards");
  return api<{ accepted: number; failed: number }>(
    `/api/jobs/${jobId}/drafts/accept-all`,
    { method: "POST" },
  );
}

export function rejectCard(cardId: string) {
  if (isGuest()) guestUnsupported("reject cards");
  return api<CardDraftView>(`/api/cards/${cardId}/reject`, { method: "POST" });
}

export type ListDueOpts = { deckId?: string; subjectId?: string };

export function listDueCards(opts?: ListDueOpts) {
  if (isGuest()) return Promise.resolve(guestListDueCards(opts));
  const q = opts?.deckId
    ? `?deckId=${encodeURIComponent(opts.deckId)}`
    : opts?.subjectId
      ? `?subjectId=${encodeURIComponent(opts.subjectId)}`
      : "";
  return api<CardDraftView[]>(`/api/study/due${q}`);
}

/** Accepted cards struggling by lapses or recent Again (online-only; guest gets []). */
export type StrugglingRow = {
  id: string;
  deck_id: string;
  front_preview: string;
  lapses: number;
  again_14d: number;
  difficulty: number;
  due: string;
  is_due: boolean;
};

export function listStrugglingCards() {
  if (isGuest()) return Promise.resolve([] as StrugglingRow[]);
  return api<StrugglingRow[]>("/api/study/struggling");
}

export type StudyRating = 1 | 2 | 3 | 4;

export type ReviewResult = { due: string };

export function reviewCard(cardId: string, rating: StudyRating) {
  if (isGuest()) return Promise.resolve(guestReviewCard(cardId, rating));
  return api<ReviewResult>("/api/study/review", {
    method: "POST",
    json: { cardId, rating },
  });
}

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "",
]);

/** Map browser File to upload content-type (prefer extension when type is zip/empty). */
export function resolveUploadContentType(file: File): string {
  const name = file.name.toLowerCase();
  const rawType = (file.type || "").trim().toLowerCase();
  if (name.endsWith(".pptx") && (ZIP_MIMES.has(rawType) || !rawType)) {
    return PPTX_MIME;
  }
  if (
    name.endsWith(".pdf") &&
    (!rawType || rawType === "application/octet-stream")
  ) {
    return "application/pdf";
  }
  if (rawType && !ZIP_MIMES.has(rawType)) return file.type;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".pptx")) return PPTX_MIME;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return rawType || "application/octet-stream";
}

/** Request signed URL, PUT the file to R2 (optional byte progress), then complete. */
export async function uploadMaterialFile(
  deckId: string,
  file: File,
  onProgress?: (percent: number) => void,
  opts?: { figureExtractMode?: FigureExtractMode },
): Promise<CompleteMaterialResponse> {
  const contentType = resolveUploadContentType(file);
  const { materialId, uploadUrl } = await requestMaterialUploadUrl(deckId, {
    filename: file.name || "upload.bin",
    contentType,
    size: file.size,
  });

  try {
    await uploadWithProgress(uploadUrl, file, onProgress ?? (() => {}), {
      contentType,
    });
  } catch (err) {
    if (err instanceof UploadError) {
      throw new ApiError(
        err.status || 502,
        err.message || "Failed to upload file to storage",
      );
    }
    throw new ApiError(502, "Failed to upload file to storage");
  }

  return completeMaterial(materialId, opts);
}

export async function uploadPdfWithFigureCrops(
  deckId: string,
  pdfFile: File,
  figureFiles: File[],
  onProgress?: (percent: number) => void,
  opts?: { figureExtractMode?: FigureExtractMode },
): Promise<CompleteMaterialResponse> {
  const contentType = resolveUploadContentType(pdfFile);
  const { materialId, uploadUrl } = await requestMaterialUploadUrl(deckId, {
    filename: pdfFile.name || "upload.pdf",
    contentType,
    size: pdfFile.size,
  });

  try {
    await uploadWithProgress(uploadUrl, pdfFile, onProgress ?? (() => {}), {
      contentType,
    });
    for (const [index, figure] of figureFiles.entries()) {
      const crop = await presignPdfFigure(materialId, {
        filename: figure.name || `figure-${index}.png`,
        contentType: "image/png",
        size: figure.size,
        index,
      });
      await uploadWithProgress(crop.uploadUrl, figure, () => {}, {
        contentType: "image/png",
      });
      await completeMaterial(crop.materialId);
    }
  } catch (err) {
    if (err instanceof UploadError) {
      throw new ApiError(
        err.status || 502,
        err.message || "Failed to upload file to storage",
      );
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, "Failed to upload file to storage");
  }

  return completeMaterial(materialId, opts);
}
