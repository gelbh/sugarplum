import { env as cfEnv } from "cloudflare:workers";
import {
  getWorkflowCreates,
  installWorkflowRecorders,
  resetTestDb,
  setWorkflowInstance,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  fillAllInstanceId,
  getFillAllWorkflowStatus,
  startFillAllWorkflow,
  terminateFillAllWorkflow,
} from "../../worker/generation/fillAllLifecycle";
import { executeFillAllChunks } from "../../worker/generation/fillAllWorkflow";
import { FILL_ALL_REQUEST_CAP } from "../../worker/generation/claim-orphan-fill";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("fillAllLifecycle", () => {
  it("uses deterministic instance id", () => {
    expect(fillAllInstanceId("job-a")).toBe("fill-all-job-a");
  });

  it("start returns already when instance is in-flight", async () => {
    const env = installWorkflowRecorders(cfEnv);
    const params = { jobId: "job-a", userId: "user-a" };
    expect(await startFillAllWorkflow(env, params)).toBe("started");
    expect(await startFillAllWorkflow(env, params)).toBe("already");
    expect(
      getWorkflowCreates().filter((c) => {
        const id = (c as { id?: string }).id;
        return id === "fill-all-job-a";
      }),
    ).toHaveLength(1);
  });

  it("getFillAllWorkflowStatus returns idle when not found", async () => {
    const env = installWorkflowRecorders(cfEnv);
    const status = await getFillAllWorkflowStatus(env, "missing");
    expect(status).toEqual({
      runId: "fill-all-missing",
      status: "idle",
      output: null,
    });
  });

  it("getFillAllWorkflowStatus treats instance.not_found as idle", async () => {
    const env = installWorkflowRecorders(cfEnv);
    env.FILL_ALL_WORKFLOW = {
      create: async () => {
        throw new Error("unreachable");
      },
      get: async () => {
        throw new Error("instance.not_found");
      },
    } as unknown as NonNullable<typeof env.FILL_ALL_WORKFLOW>;
    const status = await getFillAllWorkflowStatus(env, "job-a");
    expect(status.status).toBe("idle");
  });

  it("getFillAllWorkflowStatus returns complete output", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await startFillAllWorkflow(env, { jobId: "job-a", userId: "user-a" });
    const output = {
      attempted: 8,
      filled: 8,
      skipped: 0,
      remaining: 0,
      stopReason: "complete" as const,
    };
    setWorkflowInstance("fill-all-job-a", {
      status: "complete",
      output,
    });
    const status = await getFillAllWorkflowStatus(env, "job-a");
    expect(status.status).toBe("complete");
    expect(status.output).toEqual(output);
  });

  it("terminateFillAllWorkflow stops an in-flight run", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await startFillAllWorkflow(env, { jobId: "job-a", userId: "user-a" });
    expect((await getFillAllWorkflowStatus(env, "job-a")).status).toBe(
      "running",
    );
    await terminateFillAllWorkflow(env, "job-a");
    expect((await getFillAllWorkflowStatus(env, "job-a")).status).toBe(
      "terminated",
    );
  });

  it("terminateFillAllWorkflow is a no-op when idle", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await expect(
      terminateFillAllWorkflow(env, "missing"),
    ).resolves.toBeUndefined();
    expect((await getFillAllWorkflowStatus(env, "missing")).status).toBe(
      "idle",
    );
  });
});

describe("executeFillAllChunks", () => {
  it("runs multiple chunks until remaining is 0", async () => {
    const calls: number[] = [];
    let left = 20;
    const result = await executeFillAllChunks({
      cap: FILL_ALL_REQUEST_CAP,
      fillChunk: async () => {
        calls.push(left);
        const take = Math.min(FILL_ALL_REQUEST_CAP, left);
        left -= take;
        return {
          attempted: take,
          filled: take,
          skipped: 0,
          remaining: left,
          cards: [],
        };
      },
    });
    expect(calls).toHaveLength(3);
    expect(result.stopReason).toBe("complete");
    expect(result.filled).toBe(20);
    expect(result.remaining).toBe(0);
  });

  it("stops with capacity when a chunk returns early with leftovers", async () => {
    const result = await executeFillAllChunks({
      cap: FILL_ALL_REQUEST_CAP,
      fillChunk: async () => ({
        attempted: 3,
        filled: 2,
        skipped: 1,
        remaining: 10,
        cards: [],
      }),
    });
    expect(result.stopReason).toBe("capacity");
    expect(result.remaining).toBe(10);
    expect(result.filled).toBe(2);
  });

  it("stops with error when a chunk is inconclusive", async () => {
    const result = await executeFillAllChunks({
      cap: FILL_ALL_REQUEST_CAP,
      fillChunk: async () => ({
        attempted: 0,
        filled: 0,
        skipped: 0,
        remaining: 0,
        cards: [],
        inconclusive: true,
      }),
    });
    expect(result.stopReason).toBe("error");
  });

  it("honors maxChunks safety ceiling", async () => {
    const result = await executeFillAllChunks({
      cap: 2,
      maxChunks: 2,
      fillChunk: async () => ({
        attempted: 2,
        filled: 2,
        skipped: 0,
        remaining: 50,
        cards: [],
      }),
    });
    expect(result.stopReason).toBe("capacity");
    expect(result.filled).toBe(4);
  });

  it("stops with soft_fail_budget and carries counts across chunks", async () => {
    const seen: Record<string, number>[] = [];
    const result = await executeFillAllChunks({
      cap: FILL_ALL_REQUEST_CAP,
      fillChunk: async ({ softFailCounts }) => {
        seen.push({ ...softFailCounts });
        if (Object.keys(softFailCounts).length === 0) {
          return {
            // Full chunk so the loop continues (attempted === cap).
            attempted: FILL_ALL_REQUEST_CAP,
            filled: 0,
            skipped: FILL_ALL_REQUEST_CAP,
            remaining: 2,
            cards: [],
            softFailCounts: { "cl-a": 1, "cl-b": 1 },
          };
        }
        return {
          attempted: 0,
          filled: 0,
          skipped: 2,
          remaining: 2,
          cards: [],
          softFailBudgetExhausted: true,
          softFailCounts,
        };
      },
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ "cl-a": 1, "cl-b": 1 });
    expect(result.stopReason).toBe("soft_fail_budget");
    expect(result.remaining).toBe(2);
  });
});
