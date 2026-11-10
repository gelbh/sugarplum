import {
  State,
  default_maximum_interval,
  get_fuzz_range,
} from "ts-fsrs";
import type { FsrsSchedulerCard } from "./retrievability";

export type EasyDay = "normal" | "reduced" | "minimum";

export const DEFAULT_EASY_DAYS: readonly EasyDay[] = [
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
] as const;

export type LoadBalanceContext = {
  enableLoadBalance: boolean;
  enableFuzz: boolean;
  /** Mon=0 … Sun=6 */
  easyDays: readonly EasyDay[];
  now: Date;
  /** Same convention as study `tzOffsetMinutes` (JS getTimezoneOffset). */
  tzOffsetMinutes: number;
  /** Local calendar day `YYYY-MM-DD` → due count (future dues). */
  dueCntPerDay: ReadonlyMap<string, number>;
  /** Backlog + due today (Anki today bucket). */
  dueToday: number;
  reviewedToday: number;
  maximumInterval?: number;
};

const MS_PER_DAY = 86_400_000;
const FUZZ_MIN_IVL = 2.5;

const EASY_FACTOR: Record<EasyDay, number> = {
  normal: 1,
  reduced: 0.5,
  minimum: 0,
};

export function isEasyDay(value: unknown): value is EasyDay {
  return value === "normal" || value === "reduced" || value === "minimum";
}

export function clampEasyDays(
  input: unknown,
  fallback: readonly EasyDay[] = DEFAULT_EASY_DAYS,
): EasyDay[] {
  if (!Array.isArray(input) || input.length !== 7) {
    return [...fallback];
  }
  return input.map((v, i) => (isEasyDay(v) ? v : (fallback[i] ?? "normal")));
}

/** Local wall-clock instant treated as UTC components (study tzOffset convention). */
function toLocalAsUtc(date: Date, tzOffsetMinutes: number): Date {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000);
}

export function localDayKey(date: Date, tzOffsetMinutes: number): string {
  const local = toLocalAsUtc(date, tzOffsetMinutes);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday=0 … Sunday=6 */
export function localWeekdayMon0(date: Date, tzOffsetMinutes: number): number {
  const jsDay = toLocalAsUtc(date, tzOffsetMinutes).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function hashSeed(cardId: string): number {
  let h = 2166136261;
  for (let i = 0; i < cardId.length; i++) {
    h ^= cardId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function selectWeightedInterval(
  intervals: { ivl: number; weight: number }[],
  seed: number,
): number {
  const total = intervals.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return intervals[0]!.ivl;
  const rand = mulberry32(seed)() * total;
  let acc = 0;
  for (const item of intervals) {
    acc += item.weight;
    if (rand < acc) return item.ivl;
  }
  return intervals[intervals.length - 1]!.ivl;
}

/**
 * Re-pick due inside the FSRS fuzz window using due-count load + easy days.
 * Expects an unfuzzed (ideal) interval on the card when both load balance and
 * fuzz prefs are on at the call site.
 */
export function applyLoadBalance(
  card: FsrsSchedulerCard,
  ctx: LoadBalanceContext,
): FsrsSchedulerCard {
  if (!ctx.enableLoadBalance || !ctx.enableFuzz) return card;
  if (card.state !== State.Review) return card;

  const ideal = card.scheduledDays;
  if (!(ideal >= FUZZ_MIN_IVL)) return card;

  const last = card.lastReviewAt ?? ctx.now;
  const elapsedDays = Math.max(
    0,
    Math.floor((ctx.now.getTime() - last.getTime()) / MS_PER_DAY),
  );
  const maximumInterval = ctx.maximumInterval ?? default_maximum_interval;
  const { min_ivl, max_ivl } = get_fuzz_range(
    ideal,
    elapsedDays,
    maximumInterval,
  );
  if (max_ivl <= min_ivl) return card;

  const todayKey = localDayKey(ctx.now, ctx.tzOffsetMinutes);
  const candidates: {
    ivl: number;
    reviewCount: number;
    weekday: number;
  }[] = [];

  for (let ivl = min_ivl; ivl <= max_ivl; ivl++) {
    const dueAt = new Date(last.getTime() + ivl * MS_PER_DAY);
    const key = localDayKey(dueAt, ctx.tzOffsetMinutes);
    const weekday = localWeekdayMon0(dueAt, ctx.tzOffsetMinutes);
    let reviewCount: number;
    if (key <= todayKey) {
      reviewCount = ctx.dueToday + ctx.reviewedToday;
    } else {
      reviewCount = ctx.dueCntPerDay.get(key) ?? 0;
    }
    candidates.push({ ivl, reviewCount, weekday });
  }

  if (candidates.length <= 1) return card;

  const easy = clampEasyDays(ctx.easyDays);
  const withEasy = candidates.map((c) => {
    const easyModifier = EASY_FACTOR[easy[c.weekday] ?? "normal"] ?? 1;
    const count = Math.max(1, c.reviewCount);
    const delta = Math.max(1, c.ivl);
    const weight =
      (1 / count ** 2.15) * (1 / delta ** 3) * easyModifier;
    return { ivl: c.ivl, weight };
  });

  const positive = withEasy.filter((x) => x.weight > 0);
  const pool = positive.length > 0 ? positive : withEasy.map((x) => ({
    ivl: x.ivl,
    weight:
      (1 / Math.max(1, candidates.find((c) => c.ivl === x.ivl)?.reviewCount ?? 1) **
        2.15) *
      (1 / Math.max(1, x.ivl) ** 3),
  }));

  const pickedIvl = selectWeightedInterval(pool, hashSeed(card.cardId));
  if (pickedIvl === Math.round(ideal) && Math.abs(ideal - pickedIvl) < 1e-9) {
    // Still rewrite scheduledDays to integer when picker confirms ideal.
  }

  const dueAt = new Date(last.getTime() + pickedIvl * MS_PER_DAY);
  return {
    ...card,
    dueAt,
    scheduledDays: pickedIvl,
  };
}
