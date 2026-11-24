import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getWorkflowCreates,
  installQueueRecorders,
  installWorkflowRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
  seedUserSecret,
  TEST_SECRETS_WRAP_KEY,
} from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { encryptSecret } from "../../worker/crypto/secrets";
import {
  handleGenerateQueue,
  insertDraftCards,
  processGenerateJob,
} from "../../worker/generation/consumer";
import {
  GENERATE_QUEUE_MAX_RETRIES,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  RUNNING_JOB_STALE_MS,
} from "../../worker/generation/progress";
import { STALE_RUNNING_FAIL_ERROR } from "../../worker/generation/staleFail";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import { CHUNK_CHAR_LIMIT } from "../../worker/generation/pipeline";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../worker/generation/quota";
import { type CardDraft } from "../../worker/generation/schema";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedOwner(env: Bindings, withSecret = false) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
  return withSecret
    ? encryptSecret("sk-test-mock-key", TEST_SECRETS_WRAP_KEY).then(async (ciphertext) => {
          await seedUserSecret(env, {
            user_id: "user-a",
            provider: "mock",
            ciphertext,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          });
        },
      )
    : Promise.resolve();
}

async function seedPasteJob(
  env: Bindings,
  text: string,
) {
  await seedMaterial(env, {
    id: "mat-1",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-1.txt",
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedR2(env, "materials/deck-a/mat-1.txt", text);
  const jobId = await enqueueGeneration(env, {
    materialId: "mat-1",
    deckId: "deck-a",
  });
  return { jobId, materialId: "mat-1", deckId: "deck-a" };
}

function spyLlm(base: LlmAdapter = mockLlmAdapter()): LlmAdapter & {
  generateDrafts: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
} {
  return {
    generateDrafts: vi.fn(base.generateDrafts.bind(base)),
    complete: vi.fn(base.complete.bind(base)),
  };
}

/** Parse critique user prompt candidates and keep those whose front is allowlisted. */
function critiqueKeepFronts(keepFronts: Set<string> | string[]) {
  const allow = keepFronts instanceof Set ? keepFronts : new Set(keepFronts);
  return async ({ user }: { user: string }) => {
    const marker = "Candidate cards (JSON):\n";
    const start = user.indexOf(marker);
    if (start < 0) throw new Error("critique prompt missing candidates");
    const jsonStart = start + marker.length;
    const end = user.indexOf("\n\nReturn only", jsonStart);
    const raw = end >= 0 ? user.slice(jsonStart, end) : user.slice(jsonStart);
    const candidates = JSON.parse(raw) as CardDraft[];
    return {
      text: JSON.stringify({
        cards: candidates.filter((c) => allow.has(c.front)),
      }),
      usage: null,
    };
  };
}

/** Echo all critique candidates (rules-only path with no drops). */
function critiqueEchoCandidates() {
  return async ({ user }: { user: string }) => {
    const marker = "Candidate cards (JSON):\n";
    const start = user.indexOf(marker);
    if (start < 0) throw new Error("critique prompt missing candidates");
    const jsonStart = start + marker.length;
    const end = user.indexOf("\n\nReturn only", jsonStart);
    const raw = end >= 0 ? user.slice(jsonStart, end) : user.slice(jsonStart);
    return {
      text: JSON.stringify({ cards: JSON.parse(raw) }),
      usage: null,
    };
  };
}

describe("insertDraftCards", () => {
  it("stores distinct media_r2_keys_json per draft", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    await seedMaterial(env, {
      id: "mat-media",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-media",
      material_id: "mat-media",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: null,
    });
    const provenance = { pages: [1], excerpt: "fig" };
    const drafts = [
      {
        type: "image_label" as const,
        front: "Label A",
        back: "A",
        provenance,
        mediaR2Keys: ["materials/deck-a/figures/pdf/0.png"],
      },
      {
        type: "diagram" as const,
        front: "Label B",
        back: "B",
        provenance,
        mediaR2Keys: ["materials/deck-a/figures/pdf/1.png"],
      },
    ];
    await insertDraftCards(env.DB, {
      deckId: "deck-a",
      jobId: "job-media",
      drafts,
    });
    const cards = (await getCards(env));
    expect(cards).toHaveLength(2);
    const mediaByFront = new Map(
      cards.map((c) => [
        JSON.parse(c.front_json) as string,
        JSON.parse(c.media_r2_keys_json!) as string[],
      ]),
    );
    expect(mediaByFront.get("Label A")).toEqual([
      "materials/deck-a/figures/pdf/0.png",
    ]);
    expect(mediaByFront.get("Label B")).toEqual([
      "materials/deck-a/figures/pdf/1.png",
    ]);
  });
});

describe("processGenerateJob free path", () => {
  it("returns busy when claim loses to a fresh running job", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
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
    await seedOwner(env, false);
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
    await seedOwner(env, false);
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
    await seedOwner(env, false);
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
    await seedOwner(env, false);
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
    await seedOwner(env, false);
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
    await seedOwner(env, false);
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
    // Host wrangler.jsonc sync lives in wrangler-queue-sync.test.ts (Node).
    expect(
      GENERATE_QUEUE_MAX_RETRIES * GENERATE_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("claim from queued writes an updated_at heartbeat", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
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

  it("no secret + mock llm → needs_review and records free-gen", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm: mockLlmAdapter() });

    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect((await getCards(env)).length).toBeGreaterThanOrEqual(1);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);

    const stored = JSON.parse(job!.progress_json!) as { path?: string };
    expect(stored.path).toBe("free");

    const pollRes = await app.request(
      `/api/jobs/${msg.jobId}`,
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(pollRes.status).toBe(200);
    const poll = (await pollRes.json()) as {
      progress: { path?: string } | null;
      free_quota: { used: number; cap: number; remaining: number } | null;
    };
    expect(poll.progress?.path).toBe("free");
    expect(poll.free_quota).toEqual({
      used: 1,
      cap: FREE_GEN_DAILY_CAP,
      remaining: FREE_GEN_DAILY_CAP - 1,
    });
  });

  it("structured-only paste critiques rules via complete and consumes free quota", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    const llm = spyLlm({
      generateDrafts: async () => [],
      complete: critiqueEchoCandidates(),
    });
    const msg = await seedPasteJob(
      env,
      "What is ATP :: Adenosine triphosphate\nmitochondria: powerhouse of the cell\n",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalled();
    const critiqueUser = (llm.complete.mock.calls[0]![0] as { user: string })
      .user;
    expect(critiqueUser).toContain("What is ATP");
    expect(critiqueUser).toContain("mitochondria");

    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect((await getCards(env)).length).toBeGreaterThanOrEqual(2);
    // Rules critique uses the free LLM path.
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });

  it("rules critique drops Layer-1 survivors that the mock rejects", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    // "Overview" survives harvest + Layer-1 but is dropped by critique.
    // "mitochondria" is kept. No prose remainder → generateDrafts unused.
    const paste = [
      "mitochondria: powerhouse of the cell",
      "Overview: general summary of chapter",
    ].join("\n");
    const llm = spyLlm({
      generateDrafts: async () => [],
      complete: critiqueKeepFronts(["mitochondria"]),
    });
    const msg = await seedPasteJob(env, paste);

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalled();
    const critiqueUser = (llm.complete.mock.calls[0]![0] as { user: string })
      .user;
    expect(critiqueUser).toContain("Overview");
    expect(critiqueUser).toContain("mitochondria");

    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    const fronts = (await getCards(env))
      .map((c) => JSON.parse(c.front_json) as string);
    expect(fronts).toContain("mitochondria");
    expect(fronts.some((f) => /overview/i.test(f))).toBe(false);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });

  it("BYO secret preferred: uses override llm without free quota", async () => {
    const env = cfEnv;
    await seedOwner(env, true);
    const llm = spyLlm();
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalled();
    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);

    const stored = JSON.parse(job!.progress_json!) as { path?: string };
    expect(stored.path).toBe("byo");

    const pollRes = await app.request(
      `/api/jobs/${msg.jobId}`,
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(pollRes.status).toBe(200);
    const poll = (await pollRes.json()) as {
      progress: { path?: string } | null;
      free_quota: unknown;
    };
    expect(poll.progress?.path).toBe("byo");
    expect(poll.free_quota).toBeNull();
  });

  it("cap exceeded → failed job with actionable error", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    for (let i = 0; i < FREE_GEN_DAILY_CAP; i++) {
      await consumeFreeGenSlot(env, "user-a");
    }
    const llm = spyLlm();
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(
      /free generation|daily|Settings|BYO|UTC midnight/i,
    );
    expect((await getCards(env))).toHaveLength(0);
  });

  it("counts free-gen attempt even when generation fails afterward", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(async () => {
        throw new Error("simulated LLM failure");
      }),
      complete: vi.fn(async () => {
        throw new Error("simulated LLM failure");
      }),
    };
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalled();
    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/simulated LLM failure/);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
    expect((await getCards(env))).toHaveLength(0);
  });

  it("fails when neither BYO secret nor Workers AI is available", async () => {
    const env = cfEnv;
    await seedOwner(env, false);
    // Remove AI binding to simulate missing Workers AI
    (env as { AI?: Ai }).AI = undefined;
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg);

    const job = (await getGenerationJobs(env)).find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/Workers AI|Settings|API key/i);
    expect(job?.error).toMatch(/OpenAI|Anthropic|Google/i);
    expect(job?.error).not.toMatch(/Gemini/i);
    // Slot not consumed when AI binding is missing
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });

  it("persists mcq drafts with answer and options in back_json", async () => {
    const env = cfEnv;
    await seedOwner(env, true);
    const mcqDraft: CardDraft = {
      type: "mcq",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
      options: ["Adenosine triphosphate", "Adenosine diphosphate", "RNA"],
      provenance: { pages: [1], excerpt: "ATP stores energy" },
    };
    const paste = "ATP (adenosine triphosphate) stores cellular energy.";
    const llm = spyLlm({
      generateDrafts: async () => [],
      complete: async ({ system, user }) => {
        const s = system.toLowerCase();
        if (s.includes("extract") && s.includes("claim")) {
          const span = paste.slice(0, 40);
          return {
            text: JSON.stringify({
              claims: [
                {
                  subject: "ATP",
                  predicate: "stores cellular energy",
                  source_span: span,
                  pages: [1],
                },
              ],
            }),
            usage: null,
          };
        }
        if (s.includes("critique")) {
          return {
            text: JSON.stringify({ cards: [mcqDraft] }),
            usage: null,
          };
        }
        // write
        expect(user).toMatch(/claim/i);
        return {
          text: JSON.stringify({ cards: [mcqDraft] }),
          usage: null,
        };
      },
    });
    const msg = await seedPasteJob(env, paste);

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    const cards = (await getCards(env));
    expect(cards).toHaveLength(1);
    expect(cards[0]!.type).toBe("mcq");
    expect(JSON.parse(cards[0]!.back_json)).toEqual({
      answer: "Adenosine triphosphate",
      options: mcqDraft.options,
    });
  });

  it("multi-chunk paste emits claims/generate/critique progress with real total", async () => {
    const env = cfEnv;
    await seedOwner(env, true);
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
    await seedOwner(env, false);
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
