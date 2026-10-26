import type { Env } from "../env";

/** Max Workers AI free-generation jobs per user per UTC day. */
export const FREE_GEN_DAILY_CAP = 20;

const KEY_PREFIX = "free-gen:";

const CAP_ERROR =
  `Daily free generation limit of ${FREE_GEN_DAILY_CAP} reached. ` +
  "Add your own API key in Settings for BYO generation, or retry after UTC midnight.";

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
  const key = freeGenKvKey(userId, now);
  const count = await readCount(env, userId, now);
  if (count >= FREE_GEN_DAILY_CAP) {
    throw new Error(CAP_ERROR);
  }
  await env.SESSIONS.put(key, String(count + 1), {
    expirationTtl: ttlUntilNextUtcDay(now),
  });
}
