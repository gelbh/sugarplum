import type { GuestReviewLog } from "../guest/policyDue";
import { isGuestLogTrainable } from "../guest/policyDue";
import { FSRS_MIN_REVIEWS } from "./fsrsOptimizeConstants";
import { isOptimizeDue } from "./fsrsOptimizeDue";
import type { FsrsOptimizeStatus } from "./fsrsOptimizeTypes";
import type { FsrsPrefs } from "./fsrsFactory";
import type { StudyPrefs } from "./policyQueue";
import { validateFsrsW } from "./fsrsWeights";

export type GuestFsrsOptimizeFields = {
  fsrsW: number[] | null;
  fsrsLastOptimizedAt: string | null;
  fsrsOptimizePending: boolean;
};

export const DEFAULT_GUEST_FSRS_OPTIMIZE: GuestFsrsOptimizeFields = {
  fsrsW: null,
  fsrsLastOptimizedAt: null,
  fsrsOptimizePending: false,
};

export function normalizeGuestFsrsOptimize(
  raw: Partial<GuestFsrsOptimizeFields> | null | undefined,
): GuestFsrsOptimizeFields {
  const validated = raw?.fsrsW != null ? validateFsrsW(raw.fsrsW) : null;
  return {
    fsrsW: validated,
    fsrsLastOptimizedAt:
      typeof raw?.fsrsLastOptimizedAt === "string" &&
      raw.fsrsLastOptimizedAt.length > 0
        ? raw.fsrsLastOptimizedAt
        : null,
    fsrsOptimizePending: raw?.fsrsOptimizePending === true,
  };
}

export function countGuestTrainableReviews(
  reviewLogs: readonly GuestReviewLog[],
): number {
  let n = 0;
  for (const log of reviewLogs) {
    if (isGuestLogTrainable(log)) n += 1;
  }
  return n;
}

export function guestFsrsOptimizeStatus(
  reviewLogs: readonly GuestReviewLog[],
  fields: GuestFsrsOptimizeFields,
): FsrsOptimizeStatus {
  const reviewCount = countGuestTrainableReviews(reviewLogs);
  return {
    pending: fields.fsrsOptimizePending === true,
    lastOptimizedAt: fields.fsrsLastOptimizedAt,
    reviewCount,
    hasCustomW: Array.isArray(fields.fsrsW) && fields.fsrsW.length > 0,
    eligible: reviewCount >= FSRS_MIN_REVIEWS,
  };
}

export function nextGuestFsrsPending(
  reviewLogs: readonly GuestReviewLog[],
  fields: GuestFsrsOptimizeFields,
  now: Date = new Date(),
): boolean {
  const reviewCount = countGuestTrainableReviews(reviewLogs);
  if (reviewCount < FSRS_MIN_REVIEWS) return false;
  if (fields.fsrsOptimizePending) return true;
  return isOptimizeDue(reviewCount, fields.fsrsLastOptimizedAt, now);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Account-shaped revlog CSV from enriched guest logs only. */
export function guestRevlogCsv(
  reviewLogs: readonly GuestReviewLog[],
): string {
  const lines = [
    "card_id,review_time,review_rating,review_duration,review_state",
  ];
  for (const log of reviewLogs) {
    if (!isGuestLogTrainable(log)) continue;
    const reviewTime = Date.parse(log.at);
    if (!Number.isFinite(reviewTime)) continue;
    lines.push(
      `${csvEscape(log.cardId)},${reviewTime},${log.rating},0,${log.state}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildGuestFsrsPrefs(
  studyPrefs: StudyPrefs,
  fsrsW: number[] | null | undefined,
): FsrsPrefs {
  const validated = fsrsW ? validateFsrsW(fsrsW) : null;
  return {
    desiredRetention: studyPrefs.desiredRetention,
    enableFuzz: studyPrefs.enableFuzz,
    ...(validated ? { w: validated } : {}),
  };
}
