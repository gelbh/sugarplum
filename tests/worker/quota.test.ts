import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  freeGenDay,
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

    await expect(consumeFreeGenSlot(env, userId)).resolves.toEqual({
      day: freeGenDay(),
    });
    expect((await getFreeGenUsage(env, userId)).used).toBe(FREE_GEN_DAILY_CAP);
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
    expect((await getFreeGenUsage(env, userId)).used).toBe(FREE_GEN_DAILY_CAP);
  });

  it("concurrent reserves never overshoot the cap", async () => {
    const env = createTestEnv();
    const userId = "user-race";

    const results = await Promise.allSettled(
      Array.from({ length: FREE_GEN_DAILY_CAP + 5 }, () =>
        consumeFreeGenSlot(env, userId),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
      FREE_GEN_DAILY_CAP,
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(5);
    expect((await getFreeGenUsage(env, userId)).used).toBe(FREE_GEN_DAILY_CAP);
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
    expect(env.getFreeGenUsageRows()).toEqual([
      { user_id: userId, day: freeGenDay(), used: 1 },
    ]);
  });

  it("day uses UTC date, not local timezone", async () => {
    // 2026-03-15 22:00 in US Pacific is still 2026-03-16 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T22:00:00-07:00"));

    const env = createTestEnv();
    const userId = "user-utc-day";
    await expect(consumeFreeGenSlot(env, userId)).resolves.toEqual({
      day: "2026-03-16",
    });

    expect(freeGenDay()).toBe("2026-03-16");
    expect(env.getFreeGenUsageRows()).toEqual([
      { user_id: userId, day: "2026-03-16", used: 1 },
    ]);
  });

  it("releaseFreeGenSlot decrements and never goes below zero", async () => {
    const env = createTestEnv();
    const { day } = await consumeFreeGenSlot(env, "u1");
    await consumeFreeGenSlot(env, "u1");
    await releaseFreeGenSlot(env, "u1", day);
    expect((await getFreeGenUsage(env, "u1")).used).toBe(1);
    await releaseFreeGenSlot(env, "u1", day);
    await releaseFreeGenSlot(env, "u1", day);
    expect((await getFreeGenUsage(env, "u1")).used).toBe(0);
  });

  it("release after UTC midnight refunds the day the slot was reserved", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T23:59:59Z"));
    const env = createTestEnv();
    const { day } = await consumeFreeGenSlot(env, "u-midnight");
    expect(day).toBe("2026-03-15");

    vi.setSystemTime(new Date("2026-03-16T00:00:01Z"));
    await consumeFreeGenSlot(env, "u-midnight");
    await releaseFreeGenSlot(env, "u-midnight", day);

    expect(env.getFreeGenUsageRows()).toEqual(
      expect.arrayContaining([
        { user_id: "u-midnight", day: "2026-03-15", used: 0 },
        { user_id: "u-midnight", day: "2026-03-16", used: 1 },
      ]),
    );
    expect((await getFreeGenUsage(env, "u-midnight")).used).toBe(1);
  });
});
