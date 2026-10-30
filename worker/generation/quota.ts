import type { Env } from "../env";
import { BYO_PROVIDERS_PHRASE } from "./llm";

/** Max Workers AI free-generation jobs per user per UTC day. */
export const FREE_GEN_DAILY_CAP = 20;

const KEY_PREFIX = "free-gen:";

const CAP_ERROR =
  `Daily free generation limit of ${FREE_GEN_DAILY_CAP} reached. ` +
  `Add your own ${BYO_PROVIDERS_PHRASE} (free Flash) API key in Settings for BYO generation, or retry after UTC midnight.`;

/** KV key for a user's free-gen counter on a UTC calendar day. */
export function freeGenKvKey(userId: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${KEY_PREFIX}${userId}:${day}`;
}

async function readCount(env: Env, userId: string, now?: Date): Promise<number> {
  const raw = await env.SESSIONS.get(freeGenKvKey(userId, now));
  if (raw == null || raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Seconds until next UTC midnight (KV expirationTtl floor is 60). */
function ttlUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

async function writeCount(
  env: Env,
  userId: string,
  now: Date,
  count: number,
): Promise<void> {
  await env.SESSIONS.put(freeGenKvKey(userId, now), String(count), {
    expirationTtl: ttlUntilNextUtcDay(now),
  });
}

/** Read today's free-gen count without consuming a slot. */
export async function getFreeGenUsage(
  env: Env,
  userId: string,
): Promise<{ used: number; cap: number; remaining: number }> {
  const used = await readCount(env, userId);
  const cap = FREE_GEN_DAILY_CAP;
  const remaining = Math.max(0, cap - used);
  return { used, cap, remaining };
}

/**
 * Reserve one free-gen attempt for this UTC day: read count, throw if at cap,
 * otherwise put count+1 immediately. Call once before Workers AI / pipeline.
 *
 * ponytail: KV has no CAS - concurrent jobs can still overshoot the cap under race.
 */
export async function consumeFreeGenSlot(
  env: Env,
  userId: string,
): Promise<void> {
  const now = new Date();
  const count = await readCount(env, userId, now);
  if (count >= FREE_GEN_DAILY_CAP) {
    throw new Error(CAP_ERROR);
  }
  await writeCount(env, userId, now, count + 1);
}

/**
 * Give back a slot reserved by consumeFreeGenSlot when the attempt produced
 * nothing. Floors at zero.
 *
 * ponytail: same KV no-CAS race as consumeFreeGenSlot; a reserve before UTC
 * midnight released after it decrements the new day's counter.
 */
export async function releaseFreeGenSlot(
  env: Env,
  userId: string,
): Promise<void> {
  const now = new Date();
  const count = await readCount(env, userId, now);
  if (count <= 0) return;
  await writeCount(env, userId, now, count - 1);
}
