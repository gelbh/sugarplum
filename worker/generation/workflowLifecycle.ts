import type { Env } from "../env";
import { getDb } from "../db/client";
import type { GenerationWorkflowParams } from "./workflowParams";

function isInFlightWorkflowStatus(status: string): boolean {
  return (
    status === "running" ||
    status === "queued" ||
    status === "waiting" ||
    status === "paused" ||
    status === "waitingForPause" ||
    status === "rollingBack"
  );
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("not found") || msg.includes("does not exist");
}

/** Best-effort terminate + delete so regen can reuse jobId as instance id. */
export async function terminateGenerationWorkflow(
  env: Env,
  jobId: string,
): Promise<void> {
  const workflow = env.GENERATION_WORKFLOW;
  if (!workflow) return;
  try {
    const instance = await workflow.get(jobId);
    try {
      await instance.terminate();
    } catch {
      // Already complete / terminated.
    }
    try {
      await instance.delete();
    } catch (err) {
      console.warn("generation workflow delete failed", jobId, err);
    }
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
}

/**
 * Create a GenerationWorkflow instance (id = jobId). Replaces a finished
 * retention holder or a stale instance when D1 is still `queued`.
 */
export async function startGenerationWorkflow(
  env: Env,
  params: GenerationWorkflowParams,
): Promise<"started" | "already"> {
  const workflow = env.GENERATION_WORKFLOW;
  if (!workflow) {
    throw new Error("GENERATION_WORKFLOW is not configured");
  }

  try {
    await workflow.create({ id: params.jobId, params });
    return "started";
  } catch (createErr) {
    let instance: Awaited<ReturnType<typeof workflow.get>>;
    try {
      instance = await workflow.get(params.jobId);
    } catch (getErr) {
      if (isNotFoundError(getErr)) throw createErr;
      throw getErr;
    }

    const status = await instance.status();
    const job = await getDb(env)
      .prepare("SELECT status FROM generation_jobs WHERE id = ?")
      .bind(params.jobId)
      .first<{ status: string }>();

    // Regen / race: D1 is queued but an old instance still holds the id.
    if (job?.status === "queued") {
      try {
        await instance.terminate();
      } catch {
        // complete / terminated
      }
      try {
        await instance.delete();
      } catch (deleteErr) {
        console.warn(
          "generation workflow delete before recreate failed",
          params.jobId,
          deleteErr,
        );
      }
      await workflow.create({ id: params.jobId, params });
      return "started";
    }

    if (isInFlightWorkflowStatus(status.status)) {
      return "already";
    }

    try {
      await instance.delete();
    } catch (deleteErr) {
      console.warn(
        "generation workflow delete before recreate failed",
        params.jobId,
        deleteErr,
      );
    }
    await workflow.create({ id: params.jobId, params });
    return "started";
  }
}
