import {
  ApiError,
  listDueCards,
  reviewCard,
  type CardDraftView,
} from "../api/client";
import { isGuest } from "../guest/session";
import { saveDueCache } from "./dueCache";
import { flushPendingGrades } from "./flushPendingGrades";
import {
  listPendingGrades,
  replacePendingGrades,
  type PendingGrade,
} from "./pendingGrades";

export type FlushSummary = {
  applied: number;
  skipped: number;
  /** Post-flush due list when refreshed; null if refresh failed after applied > 0. */
  due: CardDraftView[] | null;
};

export type RunPendingFlushDeps = {
  isGuestFn?: () => boolean;
  listPending?: (userId: string) => PendingGrade[];
  listDue?: () => Promise<CardDraftView[]>;
  review?: (cardId: string, rating: 1 | 2 | 3 | 4) => Promise<unknown>;
  replacePending?: (userId: string, items: PendingGrade[]) => void;
  saveDue?: (userId: string, cards: CardDraftView[]) => void;
};

/**
 * Flush queued offline grades when online. Guest / empty queue → null.
 * Caller shows a banner when applied or skipped is > 0.
 */
export async function runPendingFlush(
  userId: string,
  deps: RunPendingFlushDeps = {},
): Promise<FlushSummary | null> {
  const guest = (deps.isGuestFn ?? isGuest)();
  if (guest) return null;

  const listPending = deps.listPending ?? listPendingGrades;
  const pending = listPending(userId);
  if (pending.length === 0) return null;

  const listDue = deps.listDue ?? listDueCards;
  const review = deps.review ?? reviewCard;
  const replacePending = deps.replacePending ?? replacePendingGrades;
  const saveDue = deps.saveDue ?? saveDueCache;

  const due = await listDue();
  const result = await flushPendingGrades({
    pending,
    dueIds: new Set(due.map((c) => c.id)),
    review,
  });
  replacePending(userId, result.remaining);

  // Re-fetch after applied grades so dueCache is not poisoned with pre-flush cards.
  if (result.applied > 0) {
    try {
      const refreshed = await listDue();
      saveDue(userId, refreshed);
      return {
        applied: result.applied,
        skipped: result.skipped,
        due: refreshed,
      };
    } catch {
      return {
        applied: result.applied,
        skipped: result.skipped,
        due: null,
      };
    }
  }

  saveDue(userId, due);
  return { applied: result.applied, skipped: result.skipped, due };
}

/** Banner line after a flush that applied or skipped at least one grade. */
export function formatFlushSummary(
  summary: Pick<FlushSummary, "applied" | "skipped">,
): string {
  const parts: string[] = [];
  if (summary.applied > 0) {
    parts.push(
      `Synced ${summary.applied} ${summary.applied === 1 ? "grade" : "grades"}`,
    );
  }
  if (summary.skipped > 0) {
    parts.push(
      `Skipped ${summary.skipped}`,
    );
  }
  return parts.join(". ") + (parts.length > 0 ? "." : "");
}

/** True when review failed due to network (not an HTTP ApiError). */
export function isNetworkGradeError(err: unknown): boolean {
  return !(err instanceof ApiError);
}
