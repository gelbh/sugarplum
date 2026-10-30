import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  freeGenKvKey,
  getFreeGenUsage,
  releaseFreeGenSlot,
} from "../../worker/generation/quota";
import { createTestEnv } from "./test-env";

describe("free generation quota", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows under the daily cap and increments via consumeFreeGenSlot", async () => {
    const env = createTestEnv();
    const userId = "user-under-cap";

    for (let i = 0; i < FREE_GEN_DAILY_CAP - 1; i++) {
      await consumeFreeGenSlot(env, userId);
    }

    await expect(consumeFreeGenSlot(env, userId)).resolves.toBeUndefined();

    const raw = await env.SESSIONS.get(freeGenKvKey(userId));
    expect(raw).toBe(String(FREE_GEN_DAILY_CAP));
  });

  it("denies at the daily cap with an actionable error", async () => {
    const env = createTestEnv();
    const userId = "user-at-cap";

    for (let i = 0; i < FREE_GEN_DAILY_CAP; i++) {
      await consumeFreeGenSlot(env, userId);
    }

    await expect(consumeFreeGenSlot(env, userId)).rejects.toThrow(
      /free generation|daily|Settings|BYO|UTC midnight/i,
    );
  });

  it("getFreeGenUsage is read-only and reflects consumeFreeGenSlot", async () => {
    const env = createTestEnv();
    const userId = "user-read-usage";

    await consumeFreeGenSlot(env, userId);

    const first = await getFreeGenUsage(env, userId);
    expect(first).toEqual({
      used: 1,
      cap: FREE_GEN_DAILY_CAP,
      remaining: FREE_GEN_DAILY_CAP - 1,
    });

    const second = await getFreeGenUsage(env, userId);
    expect(second).toEqual(first);
    expect(await env.SESSIONS.get(freeGenKvKey(userId))).toBe("1");
  });

  it("day key uses UTC date, not local timezone", async () => {
    // 2026-03-15 22:00 in US Pacific is still 2026-03-16 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T22:00:00-07:00"));

    const env = createTestEnv();
    const userId = "user-utc-day";
    await consumeFreeGenSlot(env, userId);

    expect(freeGenKvKey(userId)).toBe(`free-gen:${userId}:2026-03-16`);
    expect(await env.SESSIONS.get(`free-gen:${userId}:2026-03-16`)).toBe("1");
    expect(await env.SESSIONS.get(`free-gen:${userId}:2026-03-15`)).toBeNull();
  });

  it("releaseFreeGenSlot decrements and never goes below zero", async () => {
    const env = createTestEnv();
    await consumeFreeGenSlot(env, "u1");
    await consumeFreeGenSlot(env, "u1");
    await releaseFreeGenSlot(env, "u1");
    expect((await getFreeGenUsage(env, "u1")).used).toBe(1);
    await releaseFreeGenSlot(env, "u1");
    await releaseFreeGenSlot(env, "u1");
    expect((await getFreeGenUsage(env, "u1")).used).toBe(0);
  });
});
