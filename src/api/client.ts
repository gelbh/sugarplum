import type { AchievementItem, UnlockView } from "../achievements/wire";
import {
  UploadError,
  uploadWithProgress,
} from "../progress/uploadWithProgress";
import {
  ocrEmptyPdfPages,
  ocrEmptyPdfPagesInWindow,
  type PageText,
} from "../lib/pdfScanOcr";
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
  guestArchiveCard,
  guestDeleteCard,
  guestListDeckCards,
  guestListDecks,
  guestCommitPacing,
  guestGetStudyPrefs,
  guestListDueCards,
  guestListStrugglingCards,
  guestListSubjects,
  guestMoveCard,
  guestRestoreCard,
  guestPatchCard,
  guestPatchDeck,
  guestPatchSubject,
  guestPutStudyPrefs,
  guestResetCardSchedule,
  guestReviewCard,
  type GuestHubCardBody,
} from "../guest/store";
import type { RejectReason } from "../lib/rejectReasons";
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
  is_admin?: boolean;
};

export function importGuestLocal(body: GuestImportPayload) {
  return api<{ deckCount: number; cardCount: number }>("/api/guest/import", {
    method: "POST",
    json: body,
  });
}

export async function register(
  email: string,
  password: string,
  turnstileToken: string,
) {
  const user = await api<AuthUser>("/api/auth/register", {
    method: "POST",
    json: { email, password, turnstileToken },
  });
  await tryMergeGuestAfterAuth({ importGuest: importGuestLocal });
  return user;
}

export async function login(
  email: string,
  password: string,
  turnstileToken: string,
) {
  const user = await api<AuthUser>("/api/auth/login", {
    method: "POST",
    json: { email, password, turnstileToken },
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

export type AdminOverview = {
  userCount: number;
  createdLast7d: number;
  tokensAllTime: number;
  tokens30d: number;
  freeJobs30d: number;
  byoJobs30d: number;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
  deckCount: number;
  cardCount: number;
  jobCount: number;
  tokens30d: number;
};

export function adminOverview() {
  return api<AdminOverview>("/api/admin/overview");
}

export function adminListUsers(q?: string, limit?: number) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (limit != null) params.set("limit", String(limit));
  const qs = params.toString();
  return api<{ users: AdminUserListItem[] }>(
    `/api/admin/users${qs ? `?${qs}` : ""}`,
  );
}

export type AdminUserDetail = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
  counts: { decks: number; cards: number; jobs: number; materials: number };
  recentJobs: {
    id: string;
    status: string;
    created_at: string;
    finished_at: string | null;
    tokens_used?: number;
    tokens_prompt?: number;
    tokens_completion?: number;
    path?: "free" | "byo";
  }[];
  recentStudyDays: { day: string; intros_used: number }[];
  subjects: { id: string; title: string; created_at: string }[];
  decks: {
    id: string;
    title: string;
    subject_id: string | null;
    created_at: string;
  }[];
  materials: {
    id: string;
    deck_id: string;
    kind: string;
    filename: string | null;
    status: string;
    created_at: string;
  }[];
  studyPrefs: {
    intro_budget: number;
    review_budget: number;
    r_floor: number;
    updated_at: string;
  } | null;
  freeGenToday: { used: number; cap: number; remaining: number } | null;
  usage: {
    tokensAllTime: number;
    tokens30d: number;
    freeJobs30d: number;
    byoJobs30d: number;
  };
  cardSample: {
    id: string;
    type: string;
    status: string;
    frontPreview: string;
  }[];
};

export function adminUsageBackfill() {
  return api<{ inserted: number }>("/api/admin/usage/backfill", {
    method: "POST",
  });
}

export function adminGetUser(id: string) {
  return api<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`);
}

export function adminDisableUser(id: string) {
  return api<{ id: string; disabled_at: string }>(
    `/api/admin/users/${encodeURIComponent(id)}/disable`,
    { method: "POST" },
  );
}

export function adminEnableUser(id: string) {
  return api<{ id: string; disabled_at: null }>(
    `/api/admin/users/${encodeURIComponent(id)}/enable`,
    { method: "POST" },
  );
}

export function adminWipeUser(id: string, confirmEmail: string) {
  return api<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}/wipe`,
    { method: "POST", json: { confirmEmail } },
  );
}

export async function adminExportUser(id: string) {
  const res = await fetch(
    `/api/admin/users/${encodeURIComponent(id)}/export`,
    { credentials: "include" },
  );
  if (!res.ok) {
    let message = res.statusText || "Export failed";
    try {
      const data = (await res.json()) as ApiErrorBody;
      message = data.message ?? data.error ?? message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const filename =
    filenameFromContentDisposition(res.headers.get("content-disposition")) ??
    `user-${id}-export.json`;
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
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
  archived: number;
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

export type MaterialListItem = Material & {
  deck_title?: string;
};

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

export type ListDeckCardsOpts = { status?: "archived" };

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
  const q =
    opts?.status === "archived"
      ? "?status=archived"
      : "";
  return api<CardDraftView[]>(`/api/decks/${deckId}/cards${q}`);
}

export type HubCreateCardBody =
  | GuestHubCardBody
  | {
      type: "image_label";
      front: string;
      back: string;
      media_r2_keys: string[];
    }
  | {
      type: "occlusion";
      front: OcclusionFrontView;
      back: { answer: string };
    };

function isGuestHubCardBody(body: HubCreateCardBody): body is GuestHubCardBody {
  return (
    body.type === "qa" || body.type === "cloze" || body.type === "mcq"
  );
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
export type PasteMaterialResponse = Material & {
  jobId: string;
  reused?: boolean;
};

/** Soft client caps; server remains source of truth. */
export const MAX_TOPIC_HINTS = 5;
export const MAX_TOPIC_HINT_CHARS = 200;

/** One non-empty line per hint; strips empties and soft-caps length/count. */
export function topicHintsFromLines(raw: string): string[] | undefined {
  return sanitizeTopicHints(raw.split("\n"));
}

export function sanitizeTopicHints(hints: string[]): string[] | undefined {
  const cleaned = hints
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, MAX_TOPIC_HINT_CHARS))
    .slice(0, MAX_TOPIC_HINTS);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function pasteMaterial(
  deckId: string,
  body: { text: string; filename?: string; topicHints?: string[] },
) {
  if (isGuest()) guestUnsupported("generate cards from materials");
  return api<PasteMaterialResponse>(`/api/decks/${deckId}/materials/paste`, {
    method: "POST",
    json: body,
  });
}

type OcrRefillDecision =
  | { refill: false }
  | {
      refill: true;
      downloadUrl: string;
      expiresIn: number;
      startPage: number;
      windowEnd: number;
      coveredPages: number[];
    };

export async function refillPdfOcr(
  materialId: string,
  recognize: typeof ocrEmptyPdfPagesInWindow = ocrEmptyPdfPagesInWindow,
): Promise<void> {
  if (isGuest()) return;

  const decision = await api<OcrRefillDecision>(
    `/api/materials/${materialId}/ocr-refetch`,
    { method: "POST" },
  );
  if (!decision.refill) return;

  const res = await fetch(decision.downloadUrl);
  if (!res.ok) {
    throw new Error(`PDF refill download failed (${res.status})`);
  }

  const pages = await recognize(await res.arrayBuffer(), {
    startPage: decision.startPage,
    covered: decision.coveredPages,
  });
  if (!pages?.length) return;

  await api<{ stored: number }>(`/api/materials/${materialId}/ocr-pages`, {
    method: "POST",
    json: { pages },
  });
}

/** Queue generation for an existing ready material with a single topic hint. */
export function topicGenerate(
  deckId: string,
  body: { topic: string; materialId?: string },
) {
  if (isGuest()) guestUnsupported("generate cards for a topic");
  return api<{ jobId: string }>(`/api/decks/${deckId}/topic-generate`, {
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
  /** ISO when pipeline work first started (durable ETA clock). */
  started_at?: string;
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
export function regenJob(jobId: string, topicHints: string[] = []) {
  if (isGuest()) guestUnsupported("regenerate cards");
  const hints = sanitizeTopicHints(topicHints);
  return api<GenerationJob>(`/api/jobs/${jobId}/regen`, {
    method: "POST",
    ...(hints ? { json: { topicHints: hints } } : {}),
  });
}

export type RegenCardType = "qa" | "cloze" | "mcq";

export function asRegenType(type: string): RegenCardType | null {
  if (type === "qa" || type === "cloze" || type === "mcq") return type;
  return null;
}

export { cardHasRegenSource } from "../study/regenSource";

/** Rebuild one card as qa/cloze/mcq; siblings and FSRS schedule stay. Account-only. */
export function regenCard(cardId: string, body: { type: RegenCardType }) {
  if (isGuest()) guestUnsupported("regenerate a single card");
  return api<CardDraftView>(`/api/cards/${cardId}/regen`, {
    method: "POST",
    json: body,
  });
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

export type CompleteMaterialResponse = Material & {
  jobId: string | null;
  reused?: boolean;
};

export type FigureExtractMode = "fast" | "accurate";

export function completeMaterial(
  materialId: string,
  opts?: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    /** Register uploaded bytes only; do not start card generation. */
    attachOnly?: boolean;
    ocrPages?: PageText[];
  },
) {
  if (isGuest()) guestUnsupported("complete material uploads");
  const json: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    attachOnly?: boolean;
    ocrPages?: PageText[];
  } = {};
  if (opts?.figureExtractMode !== undefined) {
    json.figureExtractMode = opts.figureExtractMode;
  }
  if (opts?.topicHints !== undefined) {
    json.topicHints = opts.topicHints;
  }
  if (opts?.attachOnly === true) {
    json.attachOnly = true;
  }
  if (opts?.ocrPages && opts.ocrPages.length > 0) {
    json.ocrPages = opts.ocrPages;
  }
  return api<CompleteMaterialResponse>(
    `/api/materials/${materialId}/complete`,
    {
      method: "POST",
      ...(Object.keys(json).length > 0 ? { json } : {}),
    },
  );
}

export type LlmSettingsConfigured = {
  provider: string;
  last4: string;
  model: string | null;
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

export function putLlmSettings(
  provider: string,
  apiKey: string,
  model?: string,
) {
  if (isGuest()) guestUnsupported("save LLM settings");
  return api<LlmSettingsConfigured>("/api/settings/llm", {
    method: "PUT",
    json: { provider, apiKey, model },
  });
}

export function deleteLlmSettings() {
  if (isGuest()) guestUnsupported("remove LLM settings");
  return api<LlmSettingsMissing>("/api/settings/llm", { method: "DELETE" });
}

export type StudyPrefs = {
  introBudget: number;
  reviewBudget: number;
  rFloor: number;
};

export function getStudyPrefs() {
  if (isGuest()) {
    return Promise.resolve(guestGetStudyPrefs());
  }
  return api<StudyPrefs>("/api/settings/study");
}

export function putStudyPrefs(prefs: StudyPrefs) {
  if (isGuest()) {
    return Promise.resolve(guestPutStudyPrefs(prefs));
  }
  return api<StudyPrefs>("/api/settings/study", {
    method: "PUT",
    json: prefs,
  });
}

export type AchievementsResponse = {
  items: AchievementItem[];
};

export type GamificationResponse = {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
  xpTotal: number;
  level: number;
  displayName: string | null;
  boardOptIn: boolean;
};

export type LeaderboardResponse = {
  weekKey: string;
  entries: Array<{
    userId: string;
    displayName: string | null;
    xp: number;
  }>;
};

/** Fired after server writes that can move streak / XP (shell chip refetches). */
export const GAMIFICATION_CHANGED_EVENT = "sugarplum:gamification-changed";

function notifyGamificationChanged<T>(result: T): T {
  window.dispatchEvent(new Event(GAMIFICATION_CHANGED_EVENT));
  return result;
}

export function getAchievements() {
  if (isGuest()) guestUnsupported("view achievements");
  return api<AchievementsResponse>("/api/achievements");
}

export function getGamification() {
  if (isGuest()) guestUnsupported("view streaks and XP");
  return api<GamificationResponse>("/api/gamification");
}

export function getWeeklyLeaderboard() {
  if (isGuest()) guestUnsupported("view the leaderboard");
  return api<LeaderboardResponse>("/api/leaderboard/weekly");
}

export function patchGamificationSettings(body: {
  boardOptIn?: boolean;
  displayName?: string | null;
}) {
  return api<GamificationResponse>("/api/gamification/settings", {
    method: "PATCH",
    json: body,
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

export type JourneyGenerationStatus = Pick<
  JourneyStatus,
  "openReviewJobId" | "pendingGenerationJobId"
>;

export function getJourneyGeneration() {
  if (isGuest()) {
    const j = guestJourney();
    return Promise.resolve({
      openReviewJobId: j.openReviewJobId,
      pendingGenerationJobId: j.pendingGenerationJobId,
    });
  }
  return api<JourneyGenerationStatus>("/api/journey/generation");
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
      throw new ApiError(message === "Card not found" ? 404 : 400, message);
    }
  }
  return api<CardDraftView>(`/api/cards/${cardId}`, {
    method: "PATCH",
    json: body,
  });
}

export type AcceptCardResult = CardDraftView & { unlocks?: UnlockView[] };

export function acceptCard(cardId: string) {
  if (isGuest()) guestUnsupported("accept cards");
  return api<AcceptCardResult>(`/api/cards/${cardId}/accept`, {
    method: "POST",
  }).then(notifyGamificationChanged);
}

export function acceptAllJobDrafts(jobId: string) {
  if (isGuest()) guestUnsupported("accept cards");
  return api<{
    accepted: number;
    failed: number;
    rejectedSiblingCount: number;
    unlocks?: UnlockView[];
  }>(`/api/jobs/${jobId}/drafts/accept-all`, { method: "POST" }).then(
    notifyGamificationChanged,
  );
}

export function rejectCard(cardId: string, reason?: RejectReason | null) {
  if (isGuest()) guestUnsupported("reject cards");
  return api<CardDraftView>(`/api/cards/${cardId}/reject`, {
    method: "POST",
    ...(reason ? { json: { reason } } : {}),
  });
}

export async function moveCard(cardId: string, deckId: string) {
  if (isGuest()) {
    try {
      return guestMoveCard(cardId, deckId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Card not found";
      throw new ApiError(
        message === "Card not found" || message === "Deck not found" ? 404 : 400,
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

export type ListDueOpts = {
  deckId?: string;
  subjectId?: string;
  /** Minutes from local to UTC (`Date#getTimezoneOffset`). */
  tzOffsetMinutes?: number;
  /** Client local calendar day `YYYY-MM-DD`. */
  localDay?: string;
  /** Extra intro slices for Study more (nonneg int). */
  introBonus?: number;
};

export type StudyQueueMeta = {
  introUsed: number;
  introBudget: number;
  introAlreadyUsedToday?: number;
  introRemaining?: number;
  reviewUsed: number;
  reviewBudget: number;
  heldIntroCount: number;
  deferredCount: number;
};

export type ListDueResult = {
  cards: CardDraftView[];
  meta: StudyQueueMeta;
  pendingDeferrals?: { id: string; newDue: string }[];
};

function buildDueQuery(opts?: ListDueOpts): string {
  const params = new URLSearchParams();
  if (opts?.deckId) params.set("deckId", opts.deckId);
  else if (opts?.subjectId) params.set("subjectId", opts.subjectId);
  const tz =
    opts?.tzOffsetMinutes ??
    (typeof Date !== "undefined" ? new Date().getTimezoneOffset() : 0);
  params.set("tzOffsetMinutes", String(tz));
  if (opts?.localDay) params.set("localDay", opts.localDay);
  if (opts?.introBonus != null && opts.introBonus > 0) {
    params.set("introBonus", String(opts.introBonus));
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function listDueCards(opts?: ListDueOpts): Promise<ListDueResult> {
  if (isGuest()) {
    return Promise.resolve(guestListDueCards(opts));
  }
  return api<ListDueResult>(`/api/study/due${buildDueQuery(opts)}`);
}

/** Persist R-aware review deferrals (GET /due is peek-only). */
export function commitStudyPacing(opts?: ListDueOpts): Promise<{
  deferredCount: number;
}> {
  if (isGuest()) {
    return Promise.resolve(guestCommitPacing(opts));
  }
  return api<{ deferredCount: number }>(
    `/api/study/commit-pacing${buildDueQuery(opts)}`,
    { method: "POST" },
  );
}

/** Accepted cards ranked by weakness (API or guest local review logs). */
export type StrugglingRow = {
  id: string;
  deck_id: string;
  type: string;
  front_preview: string;
  lapses: number;
  again_14d: number;
  hard_14d: number;
  difficulty: number;
  due: string;
  is_due: boolean;
  retrievability?: number | null;
  has_regen_source: boolean;
};

export function listStrugglingCards() {
  if (isGuest()) return Promise.resolve(guestListStrugglingCards());
  return api<StrugglingRow[]>("/api/study/struggling");
}

export type StudyRating = 1 | 2 | 3 | 4;

export type ReviewResult = { due: string; unlocks?: UnlockView[] };

export function reviewCard(
  cardId: string,
  rating: StudyRating,
  opts?: { localDay?: string },
) {
  const localDay = opts?.localDay;
  if (isGuest()) {
    return Promise.resolve(guestReviewCard(cardId, rating, undefined, { localDay }));
  }
  return api<ReviewResult>("/api/study/review", {
    method: "POST",
    json: {
      cardId,
      rating,
      ...(localDay ? { localDay } : {}),
    },
  }).then(notifyGamificationChanged);
}

export type ExportWarnings = {
  missingMedia: number;
  skippedCards: number;
};

export type ExportJobView = {
  id: string;
  status: string;
  warnings: ExportWarnings;
  downloadPath: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type CreateDeckExportResponse = {
  id: string;
  status: string;
  warnings: ExportWarnings;
  downloadPath: string | null;
};

export type CreateExportBody =
  | { type: "deck"; deckId: string }
  | { type: "subject"; subjectId: string }
  | { type: "selection"; deckIds: string[]; subjectIds: string[] };

export function createExport(body: CreateExportBody) {
  if (isGuest()) guestUnsupported("export decks to Anki");
  return api<CreateDeckExportResponse>("/api/exports", {
    method: "POST",
    json: body,
  });
}

export function createDeckExport(deckId: string) {
  return createExport({ type: "deck", deckId });
}

export function createSubjectExport(subjectId: string) {
  return createExport({ type: "subject", subjectId });
}

export function createSelectionExport(args: {
  deckIds: string[];
  subjectIds: string[];
}) {
  return createExport({
    type: "selection",
    deckIds: args.deckIds,
    subjectIds: args.subjectIds,
  });
}

export function getExport(id: string) {
  if (isGuest()) guestUnsupported("view exports");
  return api<ExportJobView>(`/api/exports/${id}`);
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* ignore malformed encoding */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted) return quoted[1];
  const plain = /filename=([^;\s]+)/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Suggested `.apkg` basename from deck title (fallback when header omits name). */
export function apkgFilenameForDeckTitle(title: string): string {
  const base = title
    .trim()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "deck"}.apkg`;
}

/** Fetch export bytes and trigger a browser download. */
export async function downloadExport(id: string, fallbackFilename?: string) {
  if (isGuest()) guestUnsupported("download exports");
  const res = await fetch(`/api/exports/${encodeURIComponent(id)}/download`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText || "Download failed";
    try {
      const data = (await res.json()) as ApiErrorBody;
      message = data.message ?? data.error ?? message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const filename =
    fallbackFilename ??
    filenameFromContentDisposition(res.headers.get("content-disposition")) ??
    `${id}.apkg`;
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Safari may start the download after click returns; defer revoke.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
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
  opts?: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    attachOnly?: boolean;
    onScan?: () => void;
  },
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

  const ocrPages =
    contentType === "application/pdf"
      ? await scanPdfOcrPages(file, opts?.onScan)
      : undefined;
  return completeMaterial(materialId, {
    figureExtractMode: opts?.figureExtractMode,
    topicHints: opts?.topicHints,
    attachOnly: opts?.attachOnly,
    ocrPages,
  });
}

export async function uploadPdfWithFigureCrops(
  deckId: string,
  pdfFile: File,
  figureFiles: File[],
  onProgress?: (percent: number) => void,
  opts?: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    onScan?: () => void;
  },
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

  return completeMaterial(materialId, {
    figureExtractMode: opts?.figureExtractMode,
    topicHints: opts?.topicHints,
    ocrPages: await scanPdfOcrPages(pdfFile, opts?.onScan),
  });
}

async function scanPdfOcrPages(
  file: Blob,
  onScan?: () => void,
): Promise<PageText[] | undefined> {
  onScan?.();
  try {
    return await ocrEmptyPdfPages(await file.arrayBuffer());
  } catch (err) {
    console.warn("PDF scan OCR skipped", err);
    return undefined;
  }
}
