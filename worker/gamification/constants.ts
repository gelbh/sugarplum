export const XP = {
  firstStudyDayReview: 50,
  perReview: 5,
  reviewDailyCap: 100,
  acceptCard: 20,
  generation: 0,
  dailyGoalComplete: 25,
  unlock: {
    common: 25,
    uncommon: 50,
    rare: 100,
    epic: 200,
    legendary: 500,
  },
} as const;

export type Rarity = keyof typeof XP.unlock;

export function levelFromXp(xpTotal: number): number {
  if (xpTotal < 0) return 1;
  return Math.floor(Math.sqrt(xpTotal / 100)) + 1;
}

/** Cap keeps freezes from stacking into a soft habit. */
export const STREAK_FREEZE = {
  maxStored: 2,
  earnEveryDays: 7,
} as const;

export const DAILY_GOAL_REVIEWS = {
  min: 5,
  max: 100,
  default: 20,
} as const;

export { utcDay } from "../utc-day";
