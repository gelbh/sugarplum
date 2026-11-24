import { env as cfEnv } from "cloudflare:workers";
import {
  getGenerationJobs,
  installWorkflowRecorders,
  resetTestDb,
  seedConsumerOwner,
  seedGenerationJob,
  seedMaterial,
  seedPasteJob,
} from "../harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleGenerateQueue,
  processGenerateJob,
} from "../../../worker/generation/consumer";
import { RUNNING_JOB_STALE_MS } from "../../../worker/generation/progress";
import { STALE_RUNNING_FAIL_ERROR } from "../../../worker/generation/staleFail";
import { mockLlmAdapter, type LlmAdapter } from "../../../worker/generation/llm";
import { CHUNK_CHAR_LIMIT } from "../../../worker/generation/pipeline";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("processGenerateJob free path", () => {

  it("multi-chunk paste emits claims/generate/critique progress with real total", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, true);
    const base = mockLlmAdapter();
    const midGenerate: Array<{
      stage: string;
      current: number;
      total: number;
      label: string;
    }> = [];
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(async (input) => base.generateDrafts(input)),
      complete: vi.fn(async (args) => {
        const s = args.system.toLowerCase();
        if (s.includes("extract") && s.includes("claim")) {
          const job = (await getGenerationJobs(env))[0];
          if (job?.progress_json) {
            midGenerate.push(JSON.parse(job.progress_json));
          }
        }
        return base.complete(args);
      }),
    };

    const block = "x".repeat(3500);
    const msg = await seedPasteJob(env, `${block}\n\n${block}`);

    await processGenerateJob(env, { ...msg, autoFollowup: true }, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    const extractCalls = vi
      .mocked(llm.complete)
      .mock.calls.filter((c) => {
        const s = (c[0] as { system: string }).system.toLowerCase();
        return s.includes("extract") && s.includes("claim");
      });
    // Pass-1 multi-chunk extract; draft follow-up may extract again on coverage gaps.
    expect(extractCalls.length).toBeGreaterThanOrEqual(2);
    expect(midGenerate.length).toBeGreaterThanOrEqual(1);
    expect(midGenerate[0]!.stage).toBe("claims");
    expect(midGenerate[0]!.total).toBeGreaterThanOrEqual(2);
    expect(midGenerate[0]!.current).toBe(1);
    expect(midGenerate[0]!.label).toMatch(/Extracting claims \(chunk 1\//);

    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.progress_json).toBeTruthy();
    const final = JSON.parse(job!.progress_json!) as {
      stage: string;
      percent: number;
    };
    expect(final.stage).toBe("enrich");
    expect(final.percent).toBe(100);

    // Silence unused import if CHUNK used only for doc — ensure text actually chunks
    expect(`${block}\n\n${block}`.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);
  });

  it("after batch, fails leftover stale running jobs without a message", async () => {
    const env = installWorkflowRecorders(cfEnv);
    await seedConsumerOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    await seedMaterial(env, {
      id: "mat-orphan",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-10-27T15:00:00.000Z",
    });
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    await seedGenerationJob(env, {
      id: "orphan-stale",
      material_id: "mat-orphan",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({
        updated_at: staleAt,
        stage: "critique",
        percent: 77.5,
      }),
      created_at: "2026-10-27T15:02:40.280Z",
      finished_at: null,
    });

    let acked = false;
    const batch = {
      messages: [
        {
          body: msg,
          ack() {
            acked = true;
          },
          retry() {},
        },
      ],
    } as unknown as MessageBatch<{
      jobId: string;
      materialId: string;
      deckId: string;
    }>;

    await handleGenerateQueue(batch, env);

    expect(acked).toBe(true);
    const orphan = (await getGenerationJobs(env)).find((j) => j.id === "orphan-stale");
    expect(orphan?.status).toBe("failed");
    expect(orphan?.error).toBe(STALE_RUNNING_FAIL_ERROR);
  });
});
