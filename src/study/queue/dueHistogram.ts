import { localDayKey } from "./loadBalance";

export type DueHistogramBuckets = {
  dueCntPerDay: Map<string, number>;
  dueToday: number;
};

/**
 * Bucket schedule dues by local calendar day.
 * `dueToday` = count of dues on or before today (backlog + today).
 */
export function buildDueHistogramFromDues(
  dues: readonly string[],
  now: Date,
  tzOffsetMinutes: number,
): DueHistogramBuckets {
  const todayKey = localDayKey(now, tzOffsetMinutes);
  const dueCntPerDay = new Map<string, number>();
  let dueToday = 0;
  for (const due of dues) {
    const key = localDayKey(new Date(due), tzOffsetMinutes);
    dueCntPerDay.set(key, (dueCntPerDay.get(key) ?? 0) + 1);
    if (key <= todayKey) dueToday++;
  }
  return { dueCntPerDay, dueToday };
}
