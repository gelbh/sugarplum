import type { Env } from "../env";
import { getDb } from "../db/client";
import { deleteExtractSidecar } from "./extractSidecar";
import { recordGenerationUsageEventForJob } from "./usage";

/**
 * Aftermath after a running job becomes terminal (failed / needs_review).
 * Sidecar delete must not depend on usage recording succeeding.
 */
export async function afterRunningJobTerminal(
  env: Env,
  jobId: string,
): Promise<void> {
  try {
    await recordGenerationUsageEventForJob(getDb(env), jobId);
  } finally {
    await deleteExtractSidecar(env, jobId);
  }
}
