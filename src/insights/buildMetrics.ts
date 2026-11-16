import { State } from "ts-fsrs";
import { localDayKey } from "../study/loadBalance";
import { MATURE_INTERVAL_DAYS } from "../study/subjectKnowledge";
import { insightDayKeys } from "./buildSeries";
import type {
  InsightsConsistency,
  InsightsDifficultyMix,
  InsightsGradeByMaturity,
  InsightsGradeCounts,
  InsightsHourlySuccessPoint,
  InsightsPassFail,
  InsightsStabilitySnapshot,
  InsightsSubjectDifficultyStability,
  InsightsTrueRetention,
} from "./types";

export const INSIGHTS_RETENTION_DAYS = 30;
export const INSIGHTS_FUTURE_DUE_DAYS = 14;

const MS_PER_DAY = 86_400_000;

export type InsightsReviewLogRow = {
  card_id: string;
  reviewed_at: string;
  rating: number;
  scheduled_days: number | null;
  state: number | null;
};

function emptyGradeCounts(): InsightsGradeCounts {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

function passFail(pass: number, fail: number): InsightsPassFail {
  const total = pass + fail;
  return {
    pass,
    fail,
    rate: total === 0 ? null : pass / total,
  };
}

function bumpGrade(counts: InsightsGradeCounts, rating: number): void {
  if (rating === 1) counts.again += 1;
  else if (rating === 2) counts.hard += 1;
  else if (rating === 3) counts.good += 1;
  else if (rating === 4) counts.easy += 1;
}

/** Local calendar day keys for the next `days` days after today (oldest first). */
export function insightFutureDayKeys(
  now: Date,
  tzOffsetMinutes: number,
  days: number = INSIGHTS_FUTURE_DUE_DAYS,
  todayKeyOverride?: string | null,
): string[] {
  const todayKeys = insightDayKeys(now, tzOffsetMinutes, 1, todayKeyOverride);
  const today = todayKeys[0]!;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const cursor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const keys: string[] = [];
  for (let i = 1; i <= days; i++) {
    const day = new Date(cursor.getTime() + i * MS_PER_DAY);
    keys.push(
      `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return keys;
}

/**
 * First review per (card_id, localDay) in the retention window.
 * Pass = rating 2–4; Fail = rating 1.
 * Young/mature use pre-review scheduled_days (Anki lastIvl); missing → overall only.
 */
export function buildTrueRetention(
  rows: readonly InsightsReviewLogRow[],
  now: Date,
  tzOffsetMinutes: number,
  windowDays: number = INSIGHTS_RETENTION_DAYS,
  todayKeyOverride?: string | null,
): InsightsTrueRetention {
  const keys = new Set(
    insightDayKeys(now, tzOffsetMinutes, windowDays, todayKeyOverride),
  );
  const firstByCardDay = new Map<string, InsightsReviewLogRow>();
  const sorted = [...rows]
    .map((row) => ({ row, t: new Date(row.reviewed_at).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  for (const { row, t } of sorted) {
    const day = localDayKey(new Date(t), tzOffsetMinutes);
    if (!keys.has(day)) continue;
    const id = `${row.card_id}|${day}`;
    if (!firstByCardDay.has(id)) firstByCardDay.set(id, row);
  }

  let overallPass = 0;
  let overallFail = 0;
  let youngPass = 0;
  let youngFail = 0;
  let maturePass = 0;
  let matureFail = 0;

  for (const row of firstByCardDay.values()) {
    const isPass = row.rating >= 2 && row.rating <= 4;
    const isFail = row.rating === 1;
    if (!isPass && !isFail) continue;
    if (isPass) overallPass += 1;
    else overallFail += 1;

    if (row.scheduled_days == null || !Number.isFinite(row.scheduled_days)) {
      continue;
    }
    if (row.scheduled_days >= MATURE_INTERVAL_DAYS) {
      if (isPass) maturePass += 1;
      else matureFail += 1;
    } else {
      if (isPass) youngPass += 1;
      else youngFail += 1;
    }
  }

  return {
    windowDays: 30,
    overall: passFail(overallPass, overallFail),
    young: passFail(youngPass, youngFail),
    mature: passFail(maturePass, matureFail),
  };
}

export function buildWorkloadFromDues(
  dues: readonly string[],
  now: Date,
  tzOffsetMinutes: number,
  reviewIntervals: readonly number[],
  futureDays: number = INSIGHTS_FUTURE_DUE_DAYS,
  todayKeyOverride?: string | null,
): {
  dueToday: number;
  overdue: number;
  dailyLoad: number | null;
  futureDue: Array<{ day: string; count: number }>;
} {
  const todayKeys = insightDayKeys(now, tzOffsetMinutes, 1, todayKeyOverride);
  const todayKey = todayKeys[0]!;
  const futureKeys = insightFutureDayKeys(
    now,
    tzOffsetMinutes,
    futureDays,
    todayKeyOverride,
  );
  const futureCounts = new Map(futureKeys.map((k) => [k, 0]));
  let dueToday = 0;
  let overdue = 0;

  for (const due of dues) {
    const at = new Date(due);
    if (Number.isNaN(at.getTime())) continue;
    const key = localDayKey(at, tzOffsetMinutes);
    if (key === todayKey) dueToday += 1;
    else if (key < todayKey) overdue += 1;
    else if (futureCounts.has(key)) {
      futureCounts.set(key, (futureCounts.get(key) ?? 0) + 1);
    }
  }

  let dailyLoad: number | null = null;
  if (reviewIntervals.length > 0) {
    let sum = 0;
    for (const interval of reviewIntervals) {
      if (!Number.isFinite(interval)) continue;
      sum += 1 / Math.max(interval, 1);
    }
    dailyLoad = Math.round(sum * 100) / 100;
  }

  return {
    dueToday,
    overdue,
    dailyLoad,
    futureDue: futureKeys.map((day) => ({
      day,
      count: futureCounts.get(day) ?? 0,
    })),
  };
}

export function buildConsistency(
  reviewsPerDay: ReadonlyArray<{ day: string; count: number }>,
): InsightsConsistency {
  const n = reviewsPerDay.length;
  const windowDays = 30;
  if (n === 0) {
    return {
      windowDays,
      activeDays: 0,
      intensity: 0,
      score: null,
    };
  }
  let activeDays = 0;
  let sum = 0;
  for (const row of reviewsPerDay) {
    sum += row.count;
    if (row.count > 0) activeDays += 1;
  }
  if (activeDays === 0) {
    return {
      windowDays,
      activeDays: 0,
      intensity: 0,
      score: null,
    };
  }
  const mean = sum / n;
  let varSum = 0;
  for (const row of reviewsPerDay) {
    const d = row.count - mean;
    varSum += d * d;
  }
  const stddev = Math.sqrt(varSum / n);
  const score = 1 / (1 + stddev);
  return {
    windowDays,
    activeDays,
    intensity: activeDays / n,
    score,
  };
}

export function buildDifficultyMix(
  difficulties: readonly (number | null | undefined)[],
): InsightsDifficultyMix {
  let easy = 0;
  let medium = 0;
  let hard = 0;
  for (const d of difficulties) {
    if (d == null || !Number.isFinite(d)) continue;
    if (d < 4) easy += 1;
    else if (d < 7) medium += 1;
    else hard += 1;
  }
  return { easy, medium, hard, total: easy + medium + hard };
}

/** Stability bins use raw days: <1d, 1–7d, 7–21d, 21d+. */
export function buildStabilitySnapshot(
  stabilities: readonly (number | null | undefined)[],
): InsightsStabilitySnapshot {
  const values: number[] = [];
  for (const s of stabilities) {
    if (s == null || !Number.isFinite(s) || s <= 0) continue;
    values.push(s);
  }
  const bins = [
    { label: "<1d", count: 0 },
    { label: "1–7d", count: 0 },
    { label: "7–21d", count: 0 },
    { label: "21d+", count: 0 },
  ];
  for (const s of values) {
    if (s < 1) bins[0]!.count += 1;
    else if (s < 7) bins[1]!.count += 1;
    else if (s < 21) bins[2]!.count += 1;
    else bins[3]!.count += 1;
  }
  if (values.length === 0) {
    return { medianDays: null, bins };
  }
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1
      ? values[mid]!
      : (values[mid - 1]! + values[mid]!) / 2;
  return {
    medianDays: Math.round(median * 10) / 10,
    bins,
  };
}

export type SubjectDifficultyStabilityInput = {
  subjectId: string | null;
  title: string;
  difficulty: number | null | undefined;
  stability: number | null | undefined;
};

/**
 * Group accepted-card schedules by subject; reuse aggregate mix/median rules.
 * Omit subjects with no countable D and no finite median S. Sort hard-share desc.
 */
export function buildSubjectDifficultyStability(
  rows: readonly SubjectDifficultyStabilityInput[],
): InsightsSubjectDifficultyStability[] {
  type Group = {
    subjectId: string | null;
    title: string;
    difficulties: Array<number | null | undefined>;
    stabilities: Array<number | null | undefined>;
  };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const subjectId = row.subjectId;
    const key = subjectId ?? "";
    let group = groups.get(key);
    if (!group) {
      const title =
        subjectId == null
          ? "Unassigned"
          : row.title.trim().length > 0
            ? row.title.trim()
            : "Unassigned";
      group = { subjectId, title, difficulties: [], stabilities: [] };
      groups.set(key, group);
    }
    group.difficulties.push(row.difficulty);
    group.stabilities.push(row.stability);
  }

  const out: InsightsSubjectDifficultyStability[] = [];
  for (const group of groups.values()) {
    const difficulty = buildDifficultyMix(group.difficulties);
    const medianStabilityDays = buildStabilitySnapshot(
      group.stabilities,
    ).medianDays;
    if (difficulty.total === 0 && medianStabilityDays == null) continue;
    out.push({
      subjectId: group.subjectId,
      title: group.title,
      difficulty,
      medianStabilityDays,
    });
  }

  out.sort((a, b) => {
    const shareA =
      a.difficulty.total === 0
        ? Number.NEGATIVE_INFINITY
        : a.difficulty.hard / a.difficulty.total;
    const shareB =
      b.difficulty.total === 0
        ? Number.NEGATIVE_INFINITY
        : b.difficulty.hard / b.difficulty.total;
    if (shareA !== shareB) return shareB - shareA;
    return a.title.localeCompare(b.title);
  });
  return out;
}

/**
 * Grade mix by maturity for rows already filtered to the grade window.
 * Learning/Relearning → learning; missing scheduled_days → omit;
 * else young/mature on pre-review scheduled_days (same field as true retention).
 */
export function buildGradeCountsByMaturity(
  rows: ReadonlyArray<{
    rating: number;
    scheduled_days: number | null;
    state: number | null;
  }>,
): InsightsGradeByMaturity {
  const young = emptyGradeCounts();
  const mature = emptyGradeCounts();
  const learning = emptyGradeCounts();
  for (const row of rows) {
    if (
      row.state === State.Learning ||
      row.state === State.Relearning
    ) {
      bumpGrade(learning, row.rating);
      continue;
    }
    if (row.scheduled_days == null || !Number.isFinite(row.scheduled_days)) {
      continue;
    }
    if (row.scheduled_days >= MATURE_INTERVAL_DAYS) {
      bumpGrade(mature, row.rating);
    } else {
      bumpGrade(young, row.rating);
    }
  }
  return { young, mature, learning };
}

/**
 * Pass/fail success rate by local hour-of-day over the retention window.
 * Pass = rating 2–4; Fail = rating 1. Empty hours keep rate null.
 */
export function buildHourlySuccess(
  rows: ReadonlyArray<{ reviewed_at: string; rating: number }>,
  now: Date,
  tzOffsetMinutes: number,
  windowDays: number = INSIGHTS_RETENTION_DAYS,
  todayKeyOverride?: string | null,
): InsightsHourlySuccessPoint[] {
  const keys = new Set(
    insightDayKeys(now, tzOffsetMinutes, windowDays, todayKeyOverride),
  );
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    pass: 0,
    fail: 0,
  }));
  for (const row of rows) {
    const at = new Date(row.reviewed_at);
    if (Number.isNaN(at.getTime())) continue;
    if (!keys.has(localDayKey(at, tzOffsetMinutes))) continue;
    const isPass = row.rating >= 2 && row.rating <= 4;
    const isFail = row.rating === 1;
    if (!isPass && !isFail) continue;
    const hour = new Date(
      at.getTime() - tzOffsetMinutes * 60_000,
    ).getUTCHours();
    const bucket = buckets[hour];
    if (!bucket) continue;
    if (isPass) bucket.pass += 1;
    else bucket.fail += 1;
  }
  return buckets.map((b) => {
    const n = b.pass + b.fail;
    return {
      hour: b.hour,
      pass: b.pass,
      fail: b.fail,
      rate: n === 0 ? null : b.pass / n,
    };
  });
}

/** Keep full review rows in the last `days` local days. */
export function reviewRowsInLocalWindow<
  T extends { reviewed_at: string },
>(
  rows: readonly T[],
  now: Date,
  tzOffsetMinutes: number,
  days: number,
  todayKeyOverride?: string | null,
): T[] {
  const keys = new Set(
    insightDayKeys(now, tzOffsetMinutes, days, todayKeyOverride),
  );
  const out: T[] = [];
  for (const row of rows) {
    const at = new Date(row.reviewed_at);
    if (Number.isNaN(at.getTime())) continue;
    if (!keys.has(localDayKey(at, tzOffsetMinutes))) continue;
    out.push(row);
  }
  return out;
}
