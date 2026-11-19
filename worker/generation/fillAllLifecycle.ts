import type { Env } from "../env";
import {
  fillAllInstanceId,
  type FillAllRunOutput,
  type FillAllRunStatus,
  type FillAllWorkflowParams,
} from "./fillAllWorkflowParams";

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
  // Miniflare/Workers use both "not found" and "instance.not_found".
  return (
    msg.includes("not found") ||
    msg.includes("not_found") ||
    msg.includes("does not exist")
  );
}

function mapInstanceStatus(raw: string): FillAllRunStatus["status"] {
  if (isInFlightWorkflowStatus(raw)) {
    return raw === "queued" ? "queued" : "running";
  }
  if (raw === "complete") return "complete";
  if (raw === "errored") return "errored";
  if (raw === "terminated") return "terminated";
  return "running";
}

function parseOutput(raw: unknown): FillAllRunOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.attempted !== "number" || typeof o.filled !== "number") {
    return null;
  }
  if (typeof o.skipped !== "number" || typeof o.remaining !== "number") {
    return null;
  }
  if (typeof o.stopReason !== "string") return null;
  return {
    attempted: o.attempted,
    filled: o.filled,
    skipped: o.skipped,
    remaining: o.remaining,
    stopReason: o.stopReason as FillAllRunOutput["stopReason"],
  };
}

export { fillAllInstanceId };

/**
 * Create a FillAllWorkflow instance (id = fill-all-${jobId}).
 * Replaces a finished retention holder; returns already when in-flight.
 */
export async function startFillAllWorkflow(
  env: Env,
  params: FillAllWorkflowParams,
): Promise<"started" | "already"> {
  const workflow = env.FILL_ALL_WORKFLOW;
  if (!workflow) {
    throw new Error("FILL_ALL_WORKFLOW is not configured");
  }

  const id = fillAllInstanceId(params.jobId);

  try {
    await workflow.create({ id, params });
    return "started";
  } catch (createErr) {
    let instance: Awaited<ReturnType<typeof workflow.get>>;
    try {
      instance = await workflow.get(id);
    } catch (getErr) {
      if (isNotFoundError(getErr)) throw createErr;
      throw getErr;
    }

    const status = await instance.status();
    if (isInFlightWorkflowStatus(status.status)) {
      return "already";
    }

    // Re-check immediately before delete so a peer create cannot be wiped.
    try {
      const again = await workflow.get(id);
      const againStatus = await again.status();
      if (isInFlightWorkflowStatus(againStatus.status)) {
        return "already";
      }
      await again.delete();
    } catch (deleteErr) {
      if (isNotFoundError(deleteErr)) {
        // fall through to create
      } else {
        console.warn(
          "fill-all workflow delete before recreate failed",
          id,
          deleteErr,
        );
      }
    }
    try {
      await workflow.create({ id, params });
      return "started";
    } catch (recreateErr) {
      try {
        const raced = await workflow.get(id);
        const racedStatus = await raced.status();
        if (isInFlightWorkflowStatus(racedStatus.status)) {
          return "already";
        }
      } catch {
        /* ignore */
      }
      throw recreateErr;
    }
  }
}

export async function getFillAllWorkflowStatus(
  env: Env,
  jobId: string,
): Promise<FillAllRunStatus> {
  const runId = fillAllInstanceId(jobId);
  const workflow = env.FILL_ALL_WORKFLOW;
  if (!workflow) {
    return { runId, status: "idle", output: null };
  }

  try {
    const instance = await workflow.get(runId);
    const st = await instance.status();
    const mapped = mapInstanceStatus(st.status);
    const output =
      mapped === "complete" || mapped === "errored"
        ? parseOutput(
            (st as { output?: unknown }).output ??
              (st as { result?: unknown }).result,
          )
        : null;
    return { runId, status: mapped, output };
  } catch (err) {
    if (isNotFoundError(err)) {
      return { runId, status: "idle", output: null };
    }
    throw err;
  }
}
