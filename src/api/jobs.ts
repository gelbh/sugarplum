import { isGuest } from "../guest/session";
import type { UnlockView } from "../achievements/wire";
import { api, guestUnsupported } from "./core";
import { notifyGamificationChanged } from "./events";
import { sanitizeTopicHints } from "./materials";
import type {
  CardDraftView,
  ClaimCoverage,
  GenerationJob,
  JobListItem,
  RegenCardType,
} from "./types";

export function getJob(jobId: string, init?: RequestInit) {
  if (isGuest()) guestUnsupported("view generation jobs");
  return api<GenerationJob>(`/api/jobs/${jobId}`, init);
}

export function getJobClaimCoverage(jobId: string, init?: RequestInit) {
  if (isGuest()) guestUnsupported("view claim coverage");
  return api<ClaimCoverage>(`/api/jobs/${jobId}/claim-coverage`, init);
}

/** Write one draft from an orphan study claim (no job re-extract). Default type qa. */
export function generateCardFromClaim(
  jobId: string,
  claimId: string,
  body?: { type?: RegenCardType },
) {
  if (isGuest()) guestUnsupported("generate card from claim");
  return api<CardDraftView>(
    `/api/jobs/${jobId}/claims/${encodeURIComponent(claimId)}/generate`,
    {
      method: "POST",
      json: body ?? {},
    },
  );
}

export type FillOrphanClaimsResult = {
  attempted: number;
  filled: number;
  skipped: number;
  remaining: number;
  cards: CardDraftView[];
};

/** Batch-fill orphan claims for a job (soft-fail; server caps per request). */
export function generateCardsFromOrphanClaims(
  jobId: string,
  body?: { type?: RegenCardType },
) {
  if (isGuest()) guestUnsupported("generate cards from claims");
  return api<FillOrphanClaimsResult>(
    `/api/jobs/${jobId}/claims/fill-orphans`,
    {
      method: "POST",
      json: body ?? {},
    },
  );
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

/** Clear a failed/empty job from pending chrome (marks done). */
export function dismissJob(jobId: string) {
  if (isGuest()) guestUnsupported("dismiss generation job");
  return api<{ deck_id: string }>(`/api/jobs/${jobId}/dismiss`, {
    method: "POST",
  });
}

/** Owner jobs that still have draft cards (newest first). */
export function listJobsWithDrafts() {
  if (isGuest()) return Promise.resolve([]);
  return api<JobListItem[]>("/api/jobs");
}
export function mediaUrl(r2Key: string): string {
  return `/api/materials/media?key=${encodeURIComponent(r2Key)}`;
}

export function listJobDrafts(jobId: string) {
  if (isGuest()) guestUnsupported("review draft cards");
  return api<CardDraftView[]>(`/api/jobs/${jobId}/drafts`);
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

export function acceptSafeJobDrafts(jobId: string) {
  if (isGuest()) guestUnsupported("accept cards");
  return api<{
    accepted: number;
    failed: number;
    leftUnsafe: number;
    rejectedSiblingCount: number;
    unlocks?: UnlockView[];
  }>(`/api/jobs/${jobId}/drafts/accept-safe`, { method: "POST" }).then(
    notifyGamificationChanged,
  );
}
