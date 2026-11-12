import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { RUNNING_JOB_STALE_MS } from "./progress";

/** Cap concurrent generation pipelines (free AI / Workflow fan-out). */
export const MAX_GENERATION_SLOTS = 2;

/** Lease TTL; must stay ≤ stale-running window so reclaim can win. */
export const SLOT_LEASE_TTL_MS = RUNNING_JOB_STALE_MS;

const HOLDERS_KEY = "holders";

export type SlotHolder = {
  jobId: string;
  expiresAt: number;
};

export type AcquireResult =
  | { ok: true; holders: SlotHolder[] }
  | { ok: false; holders: SlotHolder[] };

export function pruneExpiredHolders(
  holders: SlotHolder[],
  nowMs: number,
): SlotHolder[] {
  return holders.filter((h) => h.expiresAt > nowMs);
}

export function tryAcquireSlot(
  holders: SlotHolder[],
  jobId: string,
  nowMs: number,
): AcquireResult {
  const live = pruneExpiredHolders(holders, nowMs);
  const existing = live.find((h) => h.jobId === jobId);
  if (existing) {
    return {
      ok: true,
      holders: live.map((h) =>
        h.jobId === jobId
          ? { jobId, expiresAt: nowMs + SLOT_LEASE_TTL_MS }
          : h,
      ),
    };
  }
  if (live.length >= MAX_GENERATION_SLOTS) {
    return { ok: false, holders: live };
  }
  return {
    ok: true,
    holders: [...live, { jobId, expiresAt: nowMs + SLOT_LEASE_TTL_MS }],
  };
}

export function releaseSlotHolder(
  holders: SlotHolder[],
  jobId: string,
): SlotHolder[] {
  return holders.filter((h) => h.jobId !== jobId);
}

/**
 * Single shared Durable Object (idFromName) holding at most two generation leases.
 */
export class GenerationSlotDO extends DurableObject<Env> {
  private async loadHolders(): Promise<SlotHolder[]> {
    return (await this.ctx.storage.get<SlotHolder[]>(HOLDERS_KEY)) ?? [];
  }

  private async saveHolders(holders: SlotHolder[]): Promise<void> {
    await this.ctx.storage.put(HOLDERS_KEY, holders);
  }

  async acquire(jobId: string): Promise<{ ok: true } | { ok: false }> {
    const now = Date.now();
    const result = tryAcquireSlot(await this.loadHolders(), jobId, now);
    await this.saveHolders(result.holders);
    return result.ok ? { ok: true } : { ok: false };
  }

  async release(jobId: string): Promise<{ ok: true }> {
    const holders = releaseSlotHolder(await this.loadHolders(), jobId);
    await this.saveHolders(holders);
    return { ok: true };
  }
}
