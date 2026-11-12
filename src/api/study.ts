import { isGuest } from "../guest/session";
import {
  guestCommitPacing,
  guestGetFsrsOptimizeStatus,
  guestGetFsrsRevlogCsv,
  guestGetStudyPrefs,
  guestListDueCards,
  guestListStrugglingCards,
  guestMarkFsrsOptimizePendingIfDue,
  guestPutStudyPrefs,
  guestResetFsrsWeights,
  guestReviewCard,
  guestSaveFsrsWeights,
} from "../guest/store";
import { api, ApiError } from "./core";
import { notifyGamificationChanged } from "./events";
import type {
  ListDueOpts,
  ListDueResult,
  ReviewResult,
  StrugglingRow,
  StudyPrefs,
  StudyRating,
  FsrsRescheduleSummary,
} from "./types";
import type { FsrsOptimizeStatus } from "../study/fsrsOptimizeTypes";

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

export function getFsrsOptimizeStatus() {
  if (isGuest()) {
    return Promise.resolve(guestGetFsrsOptimizeStatus());
  }
  return api<FsrsOptimizeStatus>("/api/settings/study/fsrs-optimize");
}

export async function getFsrsRevlogCsv(): Promise<string> {
  if (isGuest()) return guestGetFsrsRevlogCsv();
  const res = await fetch("/api/settings/study/fsrs-revlog.csv", {
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText || "Request failed");
  }
  return res.text();
}

export async function putFsrsWeights(w: number[]) {
  if (isGuest()) {
    const saved = await guestSaveFsrsWeights(w);
    return {
      ok: true as const,
      wLength: saved.wLength,
      rescheduled: saved.rescheduled,
    };
  }
  return api<{ ok: true; wLength: number; rescheduled: FsrsRescheduleSummary }>(
    "/api/settings/study/fsrs-weights",
    {
      method: "PUT",
      json: { w },
    },
  );
}

export async function resetFsrsWeights() {
  if (isGuest()) {
    const reset = await guestResetFsrsWeights();
    return {
      ok: true as const,
      rescheduled: reset.rescheduled,
    };
  }
  return api<{ ok: true; rescheduled: FsrsRescheduleSummary }>(
    "/api/settings/study/fsrs-weights/reset",
    {
      method: "POST",
    },
  );
}

export function runFsrsOptimizeNow() {
  if (isGuest()) {
    guestMarkFsrsOptimizePendingIfDue();
    return Promise.resolve({ ok: true as const, pending: true as const });
  }
  return api<{ ok: true; pending: true }>("/api/settings/study/fsrs-optimize/run", {
    method: "POST",
  });
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
export function listStrugglingCards() {
  if (isGuest()) return Promise.resolve(guestListStrugglingCards());
  return api<StrugglingRow[]>("/api/study/struggling");
}

export function reviewCard(
  cardId: string,
  rating: StudyRating,
  opts?: { localDay?: string; tzOffsetMinutes?: number },
) {
  const localDay = opts?.localDay;
  const tzOffsetMinutes =
    opts?.tzOffsetMinutes ?? new Date().getTimezoneOffset();
  if (isGuest()) {
    return guestReviewCard(cardId, rating, undefined, { localDay });
  }
  return api<ReviewResult>("/api/study/review", {
    method: "POST",
    json: {
      cardId,
      rating,
      tzOffsetMinutes,
      ...(localDay ? { localDay } : {}),
    },
  }).then(notifyGamificationChanged);
}
