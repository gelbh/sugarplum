import { isGuest } from "../guest/session";
import type { UnlockView } from "../achievements/wire";
import { api, ApiError, guestUnsupported, type ApiErrorBody } from "./core";
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

export type FillAllKickoff =
  | ({ kind: "empty" } & FillOrphanClaimsResult)
  | {
      kind: "started";
      runId: string;
      orphanTotal: number;
      status: "running" | "queued";
    };

export type FillAllRunStatus = {
  runId: string;
  status:
    | "idle"
    | "queued"
    | "running"
    | "complete"
    | "errored"
    | "terminated";
  output: {
    attempted: number;
    filled: number;
    skipped: number;
    remaining: number;
    stopReason: string;
  } | null;
};

/** Kick off durable Fill-all (202) or empty zeros (200). */
export async function generateCardsFromOrphanClaims(
  jobId: string,
  body?: { type?: RegenCardType },
): Promise<FillAllKickoff> {
  if (isGuest()) guestUnsupported("generate cards from claims");
  const headers = new Headers();
  headers.set("content-type", "application/json");
  const res = await fetch(`/api/jobs/${jobId}/claims/fill-orphans`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const data = (await res.json()) as ApiErrorBody;
      message = data.message ?? data.error ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  const json = (await res.json()) as Record<string, unknown>;
  if (res.status === 202 && typeof json.runId === "string") {
    return {
      kind: "started",
      runId: json.runId,
      orphanTotal: Number(json.orphanTotal ?? 0),
      status: json.status === "queued" ? "queued" : "running",
    };
  }
  return {
    kind: "empty",
    attempted: Number(json.attempted ?? 0),
    filled: Number(json.filled ?? 0),
    skipped: Number(json.skipped ?? 0),
    remaining: Number(json.remaining ?? 0),
    cards: Array.isArray(json.cards) ? (json.cards as CardDraftView[]) : [],
  };
}

/** Poll Fill-all Workflow status (does not use generation progress_json). */
export function getFillAllOrphansStatus(jobId: string, init?: RequestInit) {
  if (isGuest()) guestUnsupported("view fill-all status");
  return api<FillAllRunStatus>(`/api/jobs/${jobId}/claims/fill-orphans`, init);
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

export type CardRegenOpView = {
  id: string;
  cardId: string;
  status: string;
  error: string | null;
  finishedAt: string | null;
  card?: CardDraftView;
};

export function getCardRegenOp(opId: string) {
  if (isGuest()) guestUnsupported("poll card regeneration");
  return api<CardRegenOpView>(`/api/card-regen-ops/${opId}`);
}

export async function waitForCardRegenOp(
  opId: string,
  opts?: { pollMs?: number; deadlineMs?: number },
): Promise<CardDraftView> {
  const pollMs = opts?.pollMs ?? 1000;
  const deadline = Date.now() + (opts?.deadlineMs ?? 10 * 60 * 1000);
  while (Date.now() < deadline) {
    const op = await getCardRegenOp(opId);
    if (op.status === "done") {
      if (op.card) return op.card;
      throw new ApiError(422, "Regeneration finished but card is unavailable");
    }
    if (op.status === "failed") {
      throw new ApiError(422, op.error ?? "Could not regenerate card");
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new ApiError(504, "Card regeneration timed out");
}

/** Rebuild one card as qa/cloze/mcq; siblings and FSRS schedule stay. Account-only. */
export async function regenCard(
  cardId: string,
  body: { type: RegenCardType },
) {
  if (isGuest()) guestUnsupported("regenerate a single card");
  const started = await api<{
    op: { id: string; status: string; cardId: string };
  }>(`/api/cards/${cardId}/regen`, {
    method: "POST",
    json: body,
  });
  return waitForCardRegenOp(started.op.id);
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
