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

export type AuthUser = { id: string; email: string };

export function register(email: string, password: string) {
  return api<AuthUser>("/api/auth/register", {
    method: "POST",
    json: { email, password },
  });
}

export function login(email: string, password: string) {
  return api<AuthUser>("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function me() {
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
  return api<Deck[]>("/api/decks");
}

export function createDeck(title: string) {
  return api<Deck>("/api/decks", {
    method: "POST",
    json: { title },
  });
}

export function pasteMaterial(
  deckId: string,
  body: { text: string; filename?: string },
) {
  return api<Material>(`/api/decks/${deckId}/materials/paste`, {
    method: "POST",
    json: body,
  });
}

export type UploadUrlResponse = {
  materialId: string;
  uploadUrl: string;
  r2Key: string;
};

export function requestPdfUploadUrl(
  deckId: string,
  body: { filename: string; contentType: string; size: number },
) {
  return api<UploadUrlResponse>(`/api/decks/${deckId}/materials/upload-url`, {
    method: "POST",
    json: body,
  });
}

export type CompleteMaterialResponse = Material & { jobId: string | null };

export function completeMaterial(materialId: string) {
  return api<CompleteMaterialResponse>(`/api/materials/${materialId}/complete`, {
    method: "POST",
  });
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
  return api<LlmSettings>("/api/settings/llm");
}

export function putLlmSettings(provider: string, apiKey: string) {
  return api<LlmSettingsConfigured>("/api/settings/llm", {
    method: "PUT",
    json: { provider, apiKey },
  });
}

export type CardDraftView = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: "qa" | "cloze" | string;
  front: string;
  back: string;
  provenance: unknown;
  status: string;
  created_at: string;
  updated_at: string;
  due?: string;
};

export function listJobDrafts(jobId: string) {
  return api<CardDraftView[]>(`/api/jobs/${jobId}/drafts`);
}

export function patchCard(
  cardId: string,
  body: { front?: string; back?: string; type?: "qa" | "cloze" },
) {
  return api<CardDraftView>(`/api/cards/${cardId}`, {
    method: "PATCH",
    json: body,
  });
}

export function acceptCard(cardId: string) {
  return api<CardDraftView>(`/api/cards/${cardId}/accept`, { method: "POST" });
}

export function rejectCard(cardId: string) {
  return api<CardDraftView>(`/api/cards/${cardId}/reject`, { method: "POST" });
}

export function listDueCards() {
  return api<CardDraftView[]>("/api/study/due");
}

/** Request signed URL, PUT the PDF to R2, then mark ready / enqueue generation. */
export async function uploadPdf(deckId: string, file: File): Promise<CompleteMaterialResponse> {
  const { materialId, uploadUrl } = await requestPdfUploadUrl(deckId, {
    filename: file.name || "upload.pdf",
    contentType: "application/pdf",
    size: file.size,
  });

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, "Failed to upload PDF to storage");
  }

  return completeMaterial(materialId);
}
