import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getGenerationJobs,
  getWorkflowCreates,
  installWorkflowRecorders,
  resetTestDb,
  seedCard,
  seedConsumerOwner,
  seedGenerationJob,
  seedPasteJob,
  spyLlm,
} from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleGenerateQueue,
  processGenerateJob,
} from "../../worker/generation/consumer";
import {
  GENERATE_QUEUE_MAX_RETRIES,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  RUNNING_JOB_STALE_MS,
} from "../../worker/generation/progress";
import { mockLlmAdapter } from "../../worker/generation/llm";
import {
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../worker/generation/quota";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("processGenerateJob free path", () => {
  it("returns busy when claim loses to a fresh running job", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = (await getGenerationJobs(env));
    const job = jobs.find((j) => j.id === msg.jobId)!;
    await seedGenerationJob(env, {
      ...job,
      status: "running",
      progress_json: JSON.stringify({
        updated_at: new Date().toISOString(),
        stage: "generate",
        current: 0,
        total: 1,
        percent: 25,
        label: "Generating",
      }),
    });

    const llm = spyLlm();
    const result = await processGenerateJob(env, msg, { llm });

    expect(result).toBe("busy");
    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
    expect((await getCards(env))).toHaveLength(0);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("running");
  });

  it("reclaims a stale running job and finishes", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = (await getGenerationJobs(env));
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    const oldStartedAt = "2020-01-01T00:00:00.000Z";
    await seedGenerationJob(env, {
      ...job,
      status: "running",
      progress_json: JSON.stringify({
        updated_at: staleAt,
        started_at: oldStartedAt,
        stage: "figures",
        current: 1,
        total: 1,
        percent: 20,
        label: "Skipping PDF figures",
      }),
    });

    const result = await processGenerateJob(env, msg, {
      llm: mockLlmAdapter(),
    });

    expect(result).toBe("done");
    const finished = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(finished?.status).toBe("needs_review");
    expect((await getCards(env)).length).toBeGreaterThanOrEqual(1);
    const progress = JSON.parse(finished!.progress_json ?? "{}") as {
      started_at?: string;
    };
    expect(progress.started_at).toBeDefined();
    expect(progress.started_at).not.toBe(oldStartedAt);
    expect(Date.parse(progress.started_at!)).toBeGreaterThan(
      Date.parse(oldStartedAt),
    );
  });

  it("reclaim wipes prior drafts and does not double-charge free-gen", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = (await getGenerationJobs(env));
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    await seedGenerationJob(env, {
      ...job,
      status: "running",
      progress_json: JSON.stringify({
        updated_at: staleAt,
        stage: "persist",
        current: 0,
        total: 1,
        percent: 90,
        label: "Saving drafts",
        free_gen_charged: true,
      }),
    });
    // Mid-run death left a draft before the worker died.
    await seedCard(env, {
      id: "c-orphan-draft",
      deck_id: "deck-a",
      job_id: msg.jobId,
      type: "qa",
      front_json: JSON.stringify("Orphan draft from dead worker?"),
      back_json: JSON.stringify("Should be wiped on reclaim"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "orphan" }),
      status: "draft",
      created_at: "2026-01-01T01:00:00.000Z",
      updated_at: "2026-01-01T01:00:00.000Z",
    });
    // Prior attempt already consumed the free-gen slot.
    await consumeFreeGenSlot(env, "user-a");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);

    const result = await processGenerateJob(env, msg, {
      llm: mockLlmAdapter(),
    });

    expect(result).toBe("done");
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    const jobCards = (await getCards(env)).filter((c) => c.job_id === msg.jobId);
    expect(jobCards).toHaveLength(3);
    expect(jobCards.some((c) => c.id === "c-orphan-draft")).toBe(false);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
    const progress = JSON.parse(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)!.progress_json!,
    ) as { free_gen_charged?: boolean };
    expect(progress.free_gen_charged).toBe(true);
  });

  it("reclaim before first free-gen consume still charges once", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = (await getGenerationJobs(env));
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    // Died during extract: never reached consumeFreeGenSlot.
    await seedGenerationJob(env, {
      ...job,
      status: "running",
      progress_json: JSON.stringify({
        updated_at: staleAt,
        stage: "extract",
        current: 0,
        total: 0,
        percent: 5,
        label: "Extracting material",
      }),
    });
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);

    const result = await processGenerateJob(env, msg, {
      llm: mockLlmAdapter(),
    });

    expect(result).toBe("done");
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
    const progress = JSON.parse(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)!.progress_json!,
    ) as { free_gen_charged?: boolean };
    expect(progress.free_gen_charged).toBe(true);
  });

  it("acks after creating a workflow instance (thin queue starter)", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedConsumerOwner(env, false);
    const msgBody = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    const ack = vi.fn();
    const retry = vi.fn();
    await handleGenerateQueue(
      {
        queue: "sugarplum-generate",
        messages: [
          {
            id: "m1",
            timestamp: new Date(),
            body: msgBody,
            attempts: 2,
            ack,
            retry,
          },
        ],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
        metadata: { metrics: {} as never },
      },
      env,
    );

    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(getWorkflowCreates()).toEqual([
      {
        id: msgBody.jobId,
        params: msgBody,
      },
    ]);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msgBody.jobId)?.status,
    ).toBe("queued");
  });

  it("retries queue delivery when workflow create fails", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedConsumerOwner(env, false);
    const msgBody = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    env.GENERATION_WORKFLOW = {
      create: async () => {
        throw new Error("workflow unavailable");
      },
      get: async () => {
        throw new Error("not found");
      },
    } as unknown as NonNullable<typeof env.GENERATION_WORKFLOW>;

    const ack = vi.fn();
    const retry = vi.fn();
    await handleGenerateQueue(
      {
        queue: "sugarplum-generate",
        messages: [
          {
            id: "m1",
            timestamp: new Date(),
            body: msgBody,
            attempts: 2,
            ack,
            retry,
          },
        ],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
        metadata: { metrics: {} as never },
      },
      env,
    );

    expect(retry).toHaveBeenCalledWith({
      delaySeconds: GENERATE_QUEUE_RETRY_DELAY_SEC,
    });
    expect(ack).not.toHaveBeenCalled();
  });

  it("second concurrent stale reclaim loses CAS and returns busy", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = (await getGenerationJobs(env));
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    const staleProgress = JSON.stringify({
      updated_at: staleAt,
      stage: "figures",
      current: 1,
      total: 1,
      percent: 20,
      label: "Skipping PDF figures",
    });
    await seedGenerationJob(env, {
      ...job,
      status: "running",
      progress_json: staleProgress,
    });

    const gate = Promise.withResolvers<void>();
    const firstLlm = spyLlm({
      async generateDrafts(input) {
        return mockLlmAdapter().generateDrafts(input);
      },
      async complete(input) {
        await gate.promise;
        return mockLlmAdapter().complete(input);
      },
    });

    const first = processGenerateJob(env, msg, { llm: firstLlm });
    await vi.waitFor(async () => {
      const row = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)!;
      const progress = JSON.parse(row.progress_json!) as {
        updated_at?: string;
      };
      expect(progress.updated_at).not.toBe(staleAt);
    });
    const second = await processGenerateJob(env, msg, { llm: spyLlm() });
    expect(second).toBe("busy");
    gate.resolve();
    expect(await first).toBe("done");
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
  });

  it("queue retry budget covers RUNNING_JOB_STALE_MS", () => {
    expect(
      GENERATE_QUEUE_MAX_RETRIES * GENERATE_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("claim from queued writes an updated_at heartbeat", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    let sawClaimHeartbeat = false;
    const base = mockLlmAdapter();
    const llm = spyLlm({
      async generateDrafts(input) {
        return base.generateDrafts(input);
      },
      async complete(input) {
        if (!sawClaimHeartbeat) {
          const row = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
          const progress = JSON.parse(row!.progress_json!) as {
            updated_at?: string;
          };
          expect(typeof progress.updated_at).toBe("string");
          expect(Date.parse(progress.updated_at!)).not.toBeNaN();
          sawClaimHeartbeat = true;
        }
        return base.complete(input);
      },
    });

    await processGenerateJob(env, msg, { llm });
    expect(sawClaimHeartbeat).toBe(true);
  });
});
