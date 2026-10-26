import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FREE_GEN_DAILY_CAP,
  assertFreeGenAllowed,
  freeGenKvKey,
  recordFreeGen,
} from "../../worker/generation/quota";
import { createTestEnv } from "./test-env";

describe("free generation quota", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows under the daily cap and increments via recordFreeGen", async () => {
    const env = createTestEnv();
    const userId = "user-under-cap";

    await assertFreeGenAllowed(env, userId);

    for (let i = 0; i < FREE_GEN_DAILY_CAP - 1; i++) {
      await recordFreeGen(env, userId);
    }

    await expect(assertFreeGenAllowed(env, userId)).resolves.toBeUndefined();

    const raw = await env.SESSIONS.get(freeGenKvKey(userId));
    expect(raw).toBe(String(FREE_GEN_DAILY_CAP - 1));
  });

  it("denies at or over the daily cap with an actionable error", async () => {
    const env = createTestEnv();
    const userId = "user-at-cap";

    for (let i = 0; i < FREE_GEN_DAILY_CAP; i++) {
      await recordFreeGen(env, userId);
    }

    await expect(assertFreeGenAllowed(env, userId)).rejects.toThrow(
      /free generation|daily|Settings|BYO|UTC midnight/i,
    );

    await recordFreeGen(env, userId);
    await expect(assertFreeGenAllowed(env, userId)).rejects.toThrow(
      /free generation|daily|Settings|BYO|UTC midnight/i,
    );
  });

  it("day key uses UTC date, not local timezone", async () => {
    // 2026-03-15 22:00 in US Pacific is still 2026-03-16 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T22:00:00-07:00"));

    const env = createTestEnv();
    const userId = "user-utc-day";
    await recordFreeGen(env, userId);

    expect(freeGenKvKey(userId)).toBe(`free-gen:${userId}:2026-03-16`);
    expect(await env.SESSIONS.get(`free-gen:${userId}:2026-03-16`)).toBe("1");
    expect(await env.SESSIONS.get(`free-gen:${userId}:2026-03-15`)).toBeNull();
  });
});
