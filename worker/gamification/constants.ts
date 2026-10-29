export const XP = {
  firstStudyDayReview: 50,
  perReview: 5,
  reviewDailyCap: 100,
  acceptCard: 20,
  generation: 0,
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

export function utcDay(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
