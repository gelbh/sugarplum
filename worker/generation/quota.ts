import { getDb } from "../db/client";
import type { Env } from "../env";
import { utcDay } from "../utc-day";
import { BYO_PROVIDERS_PHRASE } from "./llm";

/** Max Workers AI free-generation jobs per user per UTC day. */
export const FREE_GEN_DAILY_CAP = 20;

const CAP_ERROR =
  `Daily free generation limit of ${FREE_GEN_DAILY_CAP} reached. ` +
  `Add your own ${BYO_PROVIDERS_PHRASE} (free Flash) API key in Settings for BYO generation, or retry after UTC midnight.`;

/** Shared with the sqlite test so a dropped WHERE or RETURNING fails there. */
export const RESERVE_FREE_GEN_SQL = `INSERT INTO free_gen_usage (user_id, day, used) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET used = used + 1
       WHERE used < ?
       RETURNING used`;

export const RELEASE_FREE_GEN_SQL = `UPDATE free_gen_usage SET used = used - 1
       WHERE user_id = ? AND day = ? AND used > 0`;

/** Read today's free-gen count without consuming a slot. */
export async function getFreeGenUsage(
  env: Env,
  userId: string,
): Promise<{ used: number; cap: number; remaining: number }> {
  const row = await getDb(env)
    .prepare("SELECT used FROM free_gen_usage WHERE user_id = ? AND day = ?")
    .bind(userId, utcDay())
    .first<{ used: number }>();
  const used = row?.used ?? 0;
  const cap = FREE_GEN_DAILY_CAP;
  return { used, cap, remaining: Math.max(0, cap - used) };
}

async function releaseFreeGenSlot(
  env: Env,
  userId: string,
  day: string,
): Promise<void> {
  await getDb(env)
    .prepare(RELEASE_FREE_GEN_SQL)
    .bind(userId, day)
    .run();
}

/**
 * Reserve one free-gen attempt for this UTC day in a single conditional
 * upsert; throws at cap. The returned function refunds that same day, so a
 * release after UTC midnight cannot touch the new day's row.
 */
export async function consumeFreeGenSlot(
  env: Env,
  userId: string,
): Promise<() => Promise<void>> {
  const day = utcDay();
  const row = await getDb(env)
    .prepare(RESERVE_FREE_GEN_SQL)
    .bind(userId, day, FREE_GEN_DAILY_CAP)
    .first<{ used: number }>();
  if (!row) throw new Error(CAP_ERROR);
  return () => releaseFreeGenSlot(env, userId, day);
}
