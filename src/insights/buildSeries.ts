import { localDayKey } from "../study/loadBalance";
import type { InsightsGradeCounts } from "./types";

export const INSIGHTS_REVIEWS_DAYS = 30;
export const INSIGHTS_GRADE_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/** Local calendar day keys for the last `days` days ending today (oldest first). */
export function insightDayKeys(
  now: Date,
  tzOffsetMinutes: number,
  days: number,
): string[] {
  const today = localDayKey(now, tzOffsetMinutes);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  // Noon UTC on the local YMD avoids DST edge ambiguity for stepping days.
  const cursor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(cursor.getTime() - i * MS_PER_DAY);
    keys.push(
      `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return keys;
}

export function buildReviewsPerDay(
  reviewedAtIsos: readonly string[],
  now: Date,
  tzOffsetMinutes: number,
  days: number = INSIGHTS_REVIEWS_DAYS,
): Array<{ day: string; count: number }> {
  const keys = insightDayKeys(now, tzOffsetMinutes, days);
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const iso of reviewedAtIsos) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) continue;
    const key = localDayKey(at, tzOffsetMinutes);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

export function buildGradeCounts(
  ratings: readonly number[],
): InsightsGradeCounts {
  const out: InsightsGradeCounts = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const r of ratings) {
    if (r === 1) out.again += 1;
    else if (r === 2) out.hard += 1;
    else if (r === 3) out.good += 1;
    else if (r === 4) out.easy += 1;
  }
  return out;
}

/** Keep ratings whose review time falls within the last `days` local days. */
export function ratingsInLocalWindow(
  rows: readonly { reviewed_at: string; rating: number }[],
  now: Date,
  tzOffsetMinutes: number,
  days: number,
): number[] {
  const keys = new Set(insightDayKeys(now, tzOffsetMinutes, days));
  const out: number[] = [];
  for (const row of rows) {
    const at = new Date(row.reviewed_at);
    if (Number.isNaN(at.getTime())) continue;
    if (!keys.has(localDayKey(at, tzOffsetMinutes))) continue;
    out.push(row.rating);
  }
  return out;
}
