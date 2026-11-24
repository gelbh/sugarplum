import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { RUNNING_JOB_STALE_MS } from "../../worker/generation/progress";
import {
  MAX_GENERATION_SLOTS,
  SLOT_LEASE_TTL_MS,
  pruneExpiredHolders,
  releaseSlotHolder,
  tryAcquireSlot,
  type SlotHolder,
} from "../../worker/generation/GenerationSlotDO";
import {
  acquireGenerationSlot,
  releaseGenerationSlot,
} from "../../worker/generation/slots";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("generation slot lease", () => {
  it("exports cap 2 and lease ttl at most RUNNING_JOB_STALE_MS", () => {
    expect(MAX_GENERATION_SLOTS).toBe(2);
    expect(SLOT_LEASE_TTL_MS).toBeLessThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("third waiter cannot acquire while two holders are live", () => {
    const now = 1_000_000;
    let holders: SlotHolder[] = [];

    const a = tryAcquireSlot(holders, "job-a", now);
    expect(a.ok).toBe(true);
    holders = a.holders;

    const b = tryAcquireSlot(holders, "job-b", now);
    expect(b.ok).toBe(true);
    holders = b.holders;

    const c = tryAcquireSlot(holders, "job-c", now);
    expect(c.ok).toBe(false);
    expect(c.holders).toHaveLength(2);
  });

  it("releases a slot so the third waiter can acquire", () => {
    const now = 1_000_000;
    let holders: SlotHolder[] = [];
    holders = tryAcquireSlot(holders, "job-a", now).holders;
    holders = tryAcquireSlot(holders, "job-b", now).holders;

    holders = releaseSlotHolder(holders, "job-a");
    expect(holders.map((h) => h.jobId)).toEqual(["job-b"]);

    const c = tryAcquireSlot(holders, "job-c", now);
    expect(c.ok).toBe(true);
    expect(c.holders.map((h) => h.jobId).sort()).toEqual(["job-b", "job-c"]);
  });

  it("expired leases free capacity for a waiter", () => {
    const now = 1_000_000;
    let holders: SlotHolder[] = [
      { jobId: "job-a", expiresAt: now - 1 },
      { jobId: "job-b", expiresAt: now + SLOT_LEASE_TTL_MS },
    ];
    holders = pruneExpiredHolders(holders, now);
    expect(holders.map((h) => h.jobId)).toEqual(["job-b"]);

    const c = tryAcquireSlot(holders, "job-c", now);
    expect(c.ok).toBe(true);
  });

  it("idempotent acquire for the same jobId stays ok without double-counting", () => {
    const now = 1_000_000;
    let holders: SlotHolder[] = [];
    holders = tryAcquireSlot(holders, "job-a", now).holders;
    const again = tryAcquireSlot(holders, "job-a", now);
    expect(again.ok).toBe(true);
    expect(again.holders).toHaveLength(1);
  });

  it("env slot binding: third acquire fails until a holder releases", async () => {
    const env = cfEnv;
    const a = await acquireGenerationSlot(env, "job-a");
    const b = await acquireGenerationSlot(env, "job-b");
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });

    const c = await acquireGenerationSlot(env, "job-c");
    expect(c).toEqual({ ok: false });

    await releaseGenerationSlot(env, "job-a");
    const c2 = await acquireGenerationSlot(env, "job-c");
    expect(c2).toEqual({ ok: true });
  });
});
