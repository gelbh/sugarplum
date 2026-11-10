import { describe, expect, it } from "vitest";
import { State, get_fuzz_range, default_maximum_interval } from "ts-fsrs";
import {
  applyLoadBalance,
  DEFAULT_EASY_DAYS,
  type EasyDay,
  type LoadBalanceContext,
} from "../../src/study/loadBalance";
import type { FsrsSchedulerCard } from "../../src/study/retrievability";
import { clampStudyPrefs, DEFAULT_STUDY_PREFS } from "../../src/study/policyPrefs";

function reviewCard(overrides: Partial<FsrsSchedulerCard> = {}): FsrsSchedulerCard {
  const now = overrides.lastReviewAt ?? new Date("2026-11-10T12:00:00.000Z");
  const scheduledDays = overrides.scheduledDays ?? 10;
  return {
    stability: 10,
    difficulty: 5,
    stabilityFast: 10,
    state: State.Review,
    scheduleStatus: "review",
    dueAt: new Date(now.getTime() + scheduledDays * 86_400_000),
    lastReviewAt: now,
    cardId: "card-seed-1",
    reps: 3,
    lapses: 0,
    scheduledDays,
    learningStep: 0,
    ...overrides,
  };
}

function ctx(
  partial: Partial<LoadBalanceContext> & {
    dueCntPerDay: Map<string, number>;
  },
): LoadBalanceContext {
  return {
    enableLoadBalance: true,
    enableFuzz: true,
    easyDays: [...DEFAULT_EASY_DAYS] as EasyDay[],
    now: new Date("2026-11-10T12:00:00.000Z"),
    tzOffsetMinutes: 0,
    reviewedToday: 0,
    dueToday: 0,
    maximumInterval: default_maximum_interval,
    ...partial,
  };
}

/** Local YYYY-MM-DD for `now + ivl days` at tzOffset 0 (UTC). */
function dayKeyForIvl(now: Date, ivl: number): string {
  const d = new Date(now.getTime() + ivl * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("clampStudyPrefs load balance", () => {
  it("defaults enableLoadBalance true and all-normal easyDays", () => {
    expect(DEFAULT_STUDY_PREFS.enableLoadBalance).toBe(true);
    expect(DEFAULT_STUDY_PREFS.easyDays).toEqual(DEFAULT_EASY_DAYS);
  });

  it("clamps enableLoadBalance and easyDays", () => {
    const clamped = clampStudyPrefs({
      enableLoadBalance: false,
      easyDays: [
        "minimum",
        "reduced",
        "normal",
        "bogus",
        "normal",
        "normal",
        "normal",
      ],
    });
    expect(clamped.enableLoadBalance).toBe(false);
    expect(clamped.easyDays[0]).toBe("minimum");
    expect(clamped.easyDays[1]).toBe("reduced");
    expect(clamped.easyDays[3]).toBe("normal");
  });
});

describe("applyLoadBalance", () => {
  it("skips when enableLoadBalance or enableFuzz is false", () => {
    const card = reviewCard({ scheduledDays: 10 });
    const dueCnt = new Map<string, number>();
    const base = ctx({ dueCntPerDay: dueCnt });
    expect(applyLoadBalance(card, { ...base, enableLoadBalance: false })).toBe(
      card,
    );
    expect(applyLoadBalance(card, { ...base, enableFuzz: false })).toBe(card);
  });

  it("skips Learning and short intervals", () => {
    const dueCnt = new Map<string, number>();
    const base = ctx({ dueCntPerDay: dueCnt });
    const learning = reviewCard({
      state: State.Learning,
      scheduleStatus: "learning",
      scheduledDays: 10,
    });
    expect(applyLoadBalance(learning, base)).toBe(learning);

    const short = reviewCard({ scheduledDays: 2 });
    expect(applyLoadBalance(short, base)).toBe(short);
  });

  it("prefers the lower-load day inside the fuzz window", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const ideal = 5.5;
    const { min_ivl, max_ivl } = get_fuzz_range(
      ideal,
      0,
      default_maximum_interval,
    );
    expect(max_ivl).toBeGreaterThan(min_ivl);

    const dueCnt = new Map<string, number>();
    for (let ivl = min_ivl; ivl <= max_ivl; ivl++) {
      dueCnt.set(dayKeyForIvl(now, ivl), ivl === min_ivl ? 100 : 1);
    }

    const card = reviewCard({
      scheduledDays: ideal,
      lastReviewAt: now,
      dueAt: new Date(now.getTime() + ideal * 86_400_000),
      cardId: "prefer-light",
    });

    let low = 0;
    let high = 0;
    for (let i = 0; i < 80; i++) {
      const picked = applyLoadBalance(
        { ...card, cardId: `prefer-light-${i}` },
        ctx({ dueCntPerDay: dueCnt, now }),
      );
      const ivl = Math.round(
        (picked.dueAt.getTime() - now.getTime()) / 86_400_000,
      );
      if (ivl === min_ivl) high++;
      else low++;
    }
    expect(low).toBeGreaterThan(high);
  });

  it("avoids a minimum easy day when another day is available", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    // 2026-11-10 is Tuesday. Interval 5 → Nov 15 (Sunday), 6 → Nov 16 (Monday).
    const ideal = 5.5;
    const { min_ivl, max_ivl } = get_fuzz_range(
      ideal,
      0,
      default_maximum_interval,
    );
    expect(min_ivl).toBeLessThanOrEqual(5);
    expect(max_ivl).toBeGreaterThanOrEqual(6);

    const dueCnt = new Map<string, number>();
    for (let ivl = min_ivl; ivl <= max_ivl; ivl++) {
      dueCnt.set(dayKeyForIvl(now, ivl), 1);
    }

    const easyDays = [...DEFAULT_EASY_DAYS] as EasyDay[];
    // Block Sunday (index 6)
    easyDays[6] = "minimum";

    const card = reviewCard({
      scheduledDays: ideal,
      lastReviewAt: now,
      dueAt: new Date(now.getTime() + ideal * 86_400_000),
    });

    for (let i = 0; i < 40; i++) {
      const picked = applyLoadBalance(
        { ...card, cardId: `easy-day-${i}` },
        ctx({ dueCntPerDay: dueCnt, now, easyDays }),
      );
      const ivl = Math.round(
        (picked.dueAt.getTime() - now.getTime()) / 86_400_000,
      );
      const dueDay = dayKeyForIvl(now, ivl);
      // Sunday 2026-11-15
      expect(dueDay).not.toBe("2026-11-15");
    }
  });

  it("is deterministic for the same card id and inputs", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const dueCnt = new Map<string, number>();
    for (let ivl = 8; ivl <= 12; ivl++) {
      dueCnt.set(dayKeyForIvl(now, ivl), ivl);
    }
    const card = reviewCard({
      scheduledDays: 10,
      lastReviewAt: now,
      dueAt: new Date(now.getTime() + 10 * 86_400_000),
      cardId: "stable-seed",
    });
    const c = ctx({ dueCntPerDay: dueCnt, now });
    const a = applyLoadBalance(card, c);
    const b = applyLoadBalance(card, c);
    expect(a.dueAt.toISOString()).toBe(b.dueAt.toISOString());
    expect(a.scheduledDays).toBe(b.scheduledDays);
  });
});
