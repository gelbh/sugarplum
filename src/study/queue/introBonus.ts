import { clientLocalDay } from "../localDay";

const STORAGE_KEY = "sugarplum.introBonus.v1";

type Stored = { day: string; bonus: number };

/** Day-scoped Study more counter (sessionStorage; resets next local day). */
export function getIntroBonus(now: Date = new Date()): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || parsed.day !== clientLocalDay(now)) return 0;
    const n = parsed.bonus;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  } catch {
    return 0;
  }
}

export function setIntroBonus(bonus: number, now: Date = new Date()): void {
  const n = Math.max(0, Math.floor(bonus));
  try {
    const payload: Stored = { day: clientLocalDay(now), bonus: n };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function bumpIntroBonus(now: Date = new Date()): number {
  const next = getIntroBonus(now) + 1;
  setIntroBonus(next, now);
  return next;
}
