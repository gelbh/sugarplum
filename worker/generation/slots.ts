import type { Env } from "../env";

/** Shared DO name so every Workflow contends for the same cap-2 pool. */
export const GENERATION_SLOTS_DO_NAME = "generation-slots";

type GenerationSlotStub = {
  acquire(jobId: string): Promise<{ ok: true } | { ok: false }>;
  release(jobId: string): Promise<{ ok: true }>;
};

function slotsStub(env: Env): GenerationSlotStub {
  const ns = env.GENERATION_SLOTS;
  if (!ns) {
    throw new Error("GENERATION_SLOTS binding missing");
  }
  return ns.get(ns.idFromName(GENERATION_SLOTS_DO_NAME)) as unknown as GenerationSlotStub;
}

export async function acquireGenerationSlot(
  env: Env,
  jobId: string,
): Promise<{ ok: true } | { ok: false }> {
  return slotsStub(env).acquire(jobId);
}

export async function releaseGenerationSlot(
  env: Env,
  jobId: string,
): Promise<void> {
  await slotsStub(env).release(jobId);
}
