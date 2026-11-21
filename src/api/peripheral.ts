import { isGuest } from "../guest/session";
import { guestJourney } from "../guest/store";
import { api, ApiError, guestUnsupported } from "./core";
import type { ApiErrorBody } from "./core";
import type {
  AdminOverview,
  AdminUserDetail,
  AdminUserListItem,
  CalendarStatus,
  CalendarSuggestions,
  CreateDeckExportResponse,
  CreateExportBody,
  ExportJobView,
  GamificationResponse,
  JourneyGenerationStatus,
  JourneyStatus,
  LeaderboardResponse,
  LlmSettings,
  LlmSettingsConfigured,
  LlmSettingsMissing,
  AchievementsResponse,
} from "./types";

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

export function getCalendarStatus() {
  if (isGuest()) guestUnsupported("use Google Calendar");
  return api<CalendarStatus>("/api/calendar");
}

export function getCalendarSuggestions() {
  if (isGuest()) {
    return Promise.resolve({
      subjects: [],
      decksBySubjectId: {},
    } satisfies CalendarSuggestions);
  }
  return api<CalendarSuggestions>("/api/calendar/suggestions");
}

export function linkCalendarCluster(clusterKey: string, subjectId: string) {
  if (isGuest()) guestUnsupported("link calendar subjects");
  return api<{ ok: boolean }>("/api/calendar/links", {
    method: "POST",
    json: { clusterKey, subjectId },
  });
}

export function dismissCalendarCluster(clusterKey: string) {
  if (isGuest()) guestUnsupported("dismiss calendar suggestions");
  return api<{ ok: boolean }>("/api/calendar/dismissals", {
    method: "POST",
    json: { clusterKey },
  });
}

export function disconnectCalendar() {
  if (isGuest()) guestUnsupported("disconnect Google Calendar");
  return api<{ ok: boolean }>("/api/calendar", { method: "DELETE" });
}

export function adminOverview() {
  return api<AdminOverview>("/api/admin/overview");
}

export type AdminListUsersOpts = {
  q?: string;
  limit?: number;
  status?: "all" | "active" | "disabled";
  google?: "all" | "yes" | "no";
  sort?: "created_at" | "last_activity" | "tokens_30d" | "email" | "decks";
  dir?: "asc" | "desc";
};

export function adminListUsers(opts: AdminListUsersOpts | string = {}) {
  const normalized =
    typeof opts === "string" ? { q: opts } : (opts ?? {});
  const params = new URLSearchParams();
  if (normalized.q?.trim()) params.set("q", normalized.q.trim());
  if (normalized.limit != null) params.set("limit", String(normalized.limit));
  if (normalized.status) params.set("status", normalized.status);
  if (normalized.google) params.set("google", normalized.google);
  if (normalized.sort) params.set("sort", normalized.sort);
  if (normalized.dir) params.set("dir", normalized.dir);
  const qs = params.toString();
  return api<{ users: AdminUserListItem[] }>(
    `/api/admin/users${qs ? `?${qs}` : ""}`,
  );
}

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
  return api<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/wipe`, {
    method: "POST",
    json: { confirmEmail },
  });
}

export function adminImpersonateUser(id: string) {
  return api<{
    ok: true;
    impersonation: {
      sourceUserId: string;
      sourceEmail: string;
      startedAt: number;
    };
  }>(`/api/admin/users/${encodeURIComponent(id)}/impersonate`, {
    method: "POST",
  });
}

export function adminExitImpersonation() {
  return api<{ ok: true }>("/api/admin/impersonation/exit", {
    method: "POST",
  });
}

export async function adminExportUser(id: string) {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/export`, {
    credentials: "include",
  });
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

export function getAllTimeLeaderboard() {
  if (isGuest()) guestUnsupported("view the leaderboard");
  return api<LeaderboardResponse>("/api/leaderboard/all-time");
}

export function getLeaderboard(period: "week" | "all" = "week") {
  return period === "all" ? getAllTimeLeaderboard() : getWeeklyLeaderboard();
}

export function patchGamificationSettings(body: {
  boardOptIn?: boolean;
  displayName?: string | null;
  dailyGoalReviews?: number;
}) {
  return api<GamificationResponse>("/api/gamification/settings", {
    method: "PATCH",
    json: body,
  });
}

export function getJourney() {
  if (isGuest()) return Promise.resolve(guestJourney());
  return api<JourneyStatus>("/api/journey");
}

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
