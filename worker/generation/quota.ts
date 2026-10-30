import { getDb } from "../db/client";
import type { Env } from "../env";
import { BYO_PROVIDERS_PHRASE } from "./llm";

/** Max Workers AI free-generation jobs per user per UTC day. */
export const FREE_GEN_DAILY_CAP = 20;

const CAP_ERROR =
  `Daily free generation limit of ${FREE_GEN_DAILY_CAP} reached. ` +
  `Add your own ${BYO_PROVIDERS_PHRASE} (free Flash) API key in Settings for BYO generation, or retry after UTC midnight.`;

/** UTC calendar day (YYYY-MM-DD) a free-gen slot is counted against. */
export function freeGenDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Read today's free-gen count without consuming a slot. */
export async function getFreeGenUsage(
  env: Env,
  userId: string,
): Promise<{ used: number; cap: number; remaining: number }> {
  const row = await getDb(env)
    .prepare("SELECT used FROM free_gen_usage WHERE user_id = ? AND day = ?")
    .bind(userId, freeGenDay())
    .first<{ used: number }>();
  const used = row?.used ?? 0;
  const cap = FREE_GEN_DAILY_CAP;
  return { used, cap, remaining: Math.max(0, cap - used) };
}

/**
 * Reserve one free-gen attempt for this UTC day in a single conditional
 * upsert; throws at cap. Call once before Workers AI / pipeline.
 */
export async function consumeFreeGenSlot(
  env: Env,
  userId: string,
): Promise<{ day: string }> {
  const day = freeGenDay();
  const row = await getDb(env)
    .prepare(
      `INSERT INTO free_gen_usage (user_id, day, used) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET used = used + 1
       WHERE used < ?
       RETURNING used`,
    )
    .bind(userId, day, FREE_GEN_DAILY_CAP)
    .first<{ used: number }>();
  if (!row) throw new Error(CAP_ERROR);
  return { day };
}

/**
 * Give back a slot reserved by consumeFreeGenSlot when the attempt produced
 * nothing. Pass the `day` that consume returned so a release after UTC
 * midnight refunds the reserving day. Floors at zero.
 */
export async function releaseFreeGenSlot(
  env: Env,
  userId: string,
  day: string,
): Promise<void> {
  await getDb(env)
    .prepare(
      `UPDATE free_gen_usage SET used = used - 1
       WHERE user_id = ? AND day = ? AND used > 0`,
    )
    .bind(userId, day)
    .run();
}
