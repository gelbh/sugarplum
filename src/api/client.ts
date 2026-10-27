import {
  UploadError,
  uploadWithProgress,
} from "../progress/uploadWithProgress";
import { endGuestLocal } from "../guest/endGuestLocal";
import { GUEST_USER, isGuest } from "../guest/session";
import {
  ensureGuestStore,
  guestCreateDeck,
  guestJourney,
  guestListDecks,
  guestListDueCards,
  guestReviewCard,
} from "../guest/store";

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

export async function register(email: string, password: string) {
  const user = await api<AuthUser>("/api/auth/register", {
    method: "POST",
    json: { email, password },
  });
  endGuestLocal();
  return user;
}

export async function login(email: string, password: string) {
  const user = await api<AuthUser>("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });
  endGuestLocal();
  return user;
}

export function logout() {
  if (isGuest()) {
    endGuestLocal();
    return Promise.resolve({ ok: true });
  }
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function me() {
  if (isGuest()) {
    ensureGuestStore();
    return Promise.resolve({ ...GUEST_USER });
  }
  return api<AuthUser>("/api/auth/me");
}

export type Deck = {
  id: string;
  title: string;
  subject_hint: string | null;
  created_at: string;
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

export function listDecks() {
  if (isGuest()) return Promise.resolve(guestListDecks());
  return api<Deck[]>("/api/decks");
}

export function createDeck(title: string) {
  if (isGuest()) return Promise.resolve(guestCreateDeck(title));
  return api<Deck>("/api/decks", {
    method: "POST",
    json: { title },
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
};

export type GenerationJob = {
  id: string;
  material_id: string;
  status: string;
  error: string | null;
  coverage_json: string | null;
  progress: GenerationJobProgress | null;
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

export type JobListItem = {
  id: string;
  status: string;
  draft_count: number;
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

export function completeMaterial(materialId: string) {
  if (isGuest()) guestUnsupported("complete material uploads");
  return api<CompleteMaterialResponse>(
    `/api/materials/${materialId}/complete`,
    {
      method: "POST",
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

export type CardDraftView = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: "qa" | "cloze" | "image_label" | "diagram" | "mcq" | string;
  front: string;
  back: string;
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
    front?: string;
    back?: string;
    options?: string[];
    type?: "qa" | "cloze" | "image_label" | "diagram" | "mcq";
  },
) {
  if (isGuest()) guestUnsupported("edit cards");
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

export function listDueCards() {
  if (isGuest()) return Promise.resolve(guestListDueCards());
  return api<CardDraftView[]>("/api/study/due");
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

  return completeMaterial(materialId);
}

export async function uploadPdfWithFigureCrops(
  deckId: string,
  pdfFile: File,
  figureFiles: File[],
  onProgress?: (percent: number) => void,
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

  return completeMaterial(materialId);
}
