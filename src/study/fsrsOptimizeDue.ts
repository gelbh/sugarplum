import {
  FSRS_MIN_REVIEWS,
  FSRS_RETRAIN_DAYS,
} from "./fsrsOptimizeConstants";

const MS_PER_DAY = 86_400_000;

export function isOptimizeDue(
  reviewCount: number,
  lastOptimizedAt: string | null | undefined,
  now: Date,
): boolean {
  if (reviewCount < FSRS_MIN_REVIEWS) return false;
  if (lastOptimizedAt == null || lastOptimizedAt === "") return true;
  const last = Date.parse(lastOptimizedAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= FSRS_RETRAIN_DAYS * MS_PER_DAY;
}
