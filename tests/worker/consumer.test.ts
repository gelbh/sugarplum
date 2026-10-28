import { describe, expect, it, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { encryptSecret } from "../../worker/crypto/secrets";
import {
  handleGenerateQueue,
  insertDraftCards,
  mergeAndDedupeDrafts,
  processGenerateJob,
} from "../../worker/generation/consumer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GENERATE_QUEUE_MAX_RETRIES,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  RUNNING_JOB_STALE_MS,
} from "../../worker/generation/progress";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import { CHUNK_CHAR_LIMIT } from "../../worker/generation/pipeline";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  freeGenKvKey,
} from "../../worker/generation/quota";
import type { CardDraft } from "../../worker/generation/schema";
import { createTestEnv, TEST_SECRETS_WRAP_KEY } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>, withSecret = false) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
  return withSecret
    ? encryptSecret("sk-test-mock-key", TEST_SECRETS_WRAP_KEY).then(
        (ciphertext) => {
          env.seedUserSecret({
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
  env: ReturnType<typeof createTestEnv>,
  text: string,
) {
  env.seedMaterial({
    id: "mat-1",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-1.txt",
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedR2("materials/deck-a/mat-1.txt", text);
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
    return JSON.stringify({
      cards: candidates.filter((c) => allow.has(c.front)),
    });
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
    return JSON.stringify({ cards: JSON.parse(raw) });
  };
}

describe("insertDraftCards", () => {
  it("stores distinct media_r2_keys_json per draft", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
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
    const cards = env.getCards();
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

describe("mergeAndDedupeDrafts", () => {
  it("keeps rules first and drops near-identical fronts", () => {
    const rules: CardDraft[] = [
      {
        type: "qa",
        front: "What is ATP?",
        back: "Adenosine triphosphate",
        provenance: { pages: [1], excerpt: "What is ATP :: Adenosine triphosphate" },
      },
    ];
    const llm: CardDraft[] = [
      {
        type: "qa",
        front: "  what is atp?  ",
        back: "duplicate",
        provenance: { pages: [1], excerpt: "prose" },
      },
      {
        type: "qa",
        front: "What produces ATP?",
        back: "mitochondria",
        provenance: { pages: [1], excerpt: "prose" },
      },
    ];
    const merged = mergeAndDedupeDrafts(rules, llm);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.back).toBe("Adenosine triphosphate");
    expect(merged[1]!.front).toBe("What produces ATP?");
  });
});

describe("processGenerateJob free path", () => {
  it("returns busy when claim loses to a fresh running job", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = env.getGenerationJobs();
    const job = jobs.find((j) => j.id === msg.jobId)!;
    env.seedGenerationJob({
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
    expect(env.getCards()).toHaveLength(0);
    expect(env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status).toBe(
      "running",
    );
  });

  it("reclaims a stale running job and finishes", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = env.getGenerationJobs();
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(Date.now() - RUNNING_JOB_STALE_MS - 1000).toISOString();
    env.seedGenerationJob({
      ...job,
      status: "running",
      progress_json: JSON.stringify({
        updated_at: staleAt,
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
    expect(env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status).toBe(
      "needs_review",
    );
    expect(env.getCards().length).toBeGreaterThanOrEqual(1);
  });

  it("reclaim wipes prior drafts and does not double-charge free-gen", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = env.getGenerationJobs();
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    env.seedGenerationJob({
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
    env.seedCard({
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
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");

    const result = await processGenerateJob(env, msg, {
      llm: mockLlmAdapter(),
    });

    expect(result).toBe("done");
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    const jobCards = env.getCards().filter((c) => c.job_id === msg.jobId);
    expect(jobCards).toHaveLength(3);
    expect(jobCards.some((c) => c.id === "c-orphan-draft")).toBe(false);
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
    const progress = JSON.parse(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)!.progress_json!,
    ) as { free_gen_charged?: boolean };
    expect(progress.free_gen_charged).toBe(true);
  });

  it("reclaim before first free-gen consume still charges once", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = env.getGenerationJobs();
    const job = jobs.find((j) => j.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    // Died during extract: never reached consumeFreeGenSlot.
    env.seedGenerationJob({
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
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBeNull();

    const result = await processGenerateJob(env, msg, {
      llm: mockLlmAdapter(),
    });

    expect(result).toBe("done");
    expect(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
    const progress = JSON.parse(
      env.getGenerationJobs().find((j) => j.id === msg.jobId)!.progress_json!,
    ) as { free_gen_charged?: boolean };
    expect(progress.free_gen_charged).toBe(true);
  });

  it("retries queue delivery when process returns busy", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msgBody = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = env.getGenerationJobs();
    const job = jobs.find((j) => j.id === msgBody.jobId)!;
    env.seedGenerationJob({
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
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );
    const jobs = env.getGenerationJobs();
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
    env.seedGenerationJob({
      ...job,
      status: "running",
      progress_json: staleProgress,
    });

    const gate = Promise.withResolvers<void>();
    const firstLlm = spyLlm({
      async generateDrafts(input) {
        await gate.promise;
        return mockLlmAdapter().generateDrafts(input);
      },
      async complete(input) {
        return mockLlmAdapter().complete(input);
      },
    });

    const first = processGenerateJob(env, msg, { llm: firstLlm });
    await vi.waitFor(() => {
      const row = env.getGenerationJobs().find((j) => j.id === msg.jobId)!;
      const progress = JSON.parse(row.progress_json!) as { updated_at?: string };
      expect(progress.updated_at).not.toBe(staleAt);
    });
    const second = await processGenerateJob(env, msg, { llm: spyLlm() });
    expect(second).toBe("busy");
    gate.resolve();
    expect(await first).toBe("done");
    expect(env.getGenerationJobs().find((j) => j.id === msg.jobId)?.status).toBe(
      "needs_review",
    );
  });

  it("queue retry budget covers RUNNING_JOB_STALE_MS", () => {
    const wrangler = readFileSync(
      resolve(import.meta.dirname, "../../wrangler.jsonc"),
      "utf8",
    );
    expect(wrangler).toContain(`"max_retries": ${GENERATE_QUEUE_MAX_RETRIES}`);
    expect(wrangler).toContain(
      `"retry_delay": ${GENERATE_QUEUE_RETRY_DELAY_SEC}`,
    );
    expect(
      GENERATE_QUEUE_MAX_RETRIES * GENERATE_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("claim from queued writes an updated_at heartbeat", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    let sawClaimHeartbeat = false;
    const base = mockLlmAdapter();
    const llm = spyLlm({
      async generateDrafts(input) {
        if (!sawClaimHeartbeat) {
          const row = env.getGenerationJobs().find((j) => j.id === msg.jobId);
          const progress = JSON.parse(row!.progress_json!) as {
            updated_at?: string;
          };
          expect(typeof progress.updated_at).toBe("string");
          expect(Date.parse(progress.updated_at!)).not.toBeNaN();
          sawClaimHeartbeat = true;
        }
        return base.generateDrafts(input);
      },
      async complete(input) {
        return base.complete(input);
      },
    });

    await processGenerateJob(env, msg, { llm });
    expect(sawClaimHeartbeat).toBe(true);
  });

  it("no secret + mock llm → needs_review and records free-gen", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm: mockLlmAdapter() });

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect(env.getCards().length).toBeGreaterThanOrEqual(1);
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");

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
    const env = createTestEnv();
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

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(env.getCards().length).toBeGreaterThanOrEqual(2);
    // Rules critique uses the free LLM path.
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
  });

  it("rules critique drops Layer-1 survivors that the mock rejects", async () => {
    const env = createTestEnv();
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

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    const fronts = env.getCards().map((c) => JSON.parse(c.front_json) as string);
    expect(fronts).toContain("mitochondria");
    expect(fronts.some((f) => /overview/i.test(f))).toBe(false);
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
  });

  it("BYO secret preferred: uses override llm without free quota", async () => {
    const env = createTestEnv();
    await seedOwner(env, true);
    const llm = spyLlm();
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).toHaveBeenCalled();
    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBeNull();

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
    const env = createTestEnv();
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
    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/free generation|daily|Settings|BYO|UTC midnight/i);
    expect(env.getCards()).toHaveLength(0);
  });

  it("counts free-gen attempt even when generation fails afterward", async () => {
    const env = createTestEnv();
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

    expect(llm.generateDrafts).toHaveBeenCalled();
    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/simulated LLM failure/);
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBe("1");
    expect(env.getCards()).toHaveLength(0);
  });

  it("fails when neither BYO secret nor Workers AI is available", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    // Remove AI binding to simulate missing Workers AI
    (env as { AI?: Ai }).AI = undefined;
    const msg = await seedPasteJob(
      env,
      "Mitochondria are the powerhouse of the cell.",
    );

    await processGenerateJob(env, msg);

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/Workers AI|Settings|API key/i);
    expect(job?.error).toMatch(/OpenAI|Anthropic|Google/i);
    expect(job?.error).not.toMatch(/Gemini/i);
    // Slot not consumed when AI binding is missing
    expect(await env.SESSIONS.get(freeGenKvKey("user-a"))).toBeNull();
  });

  it("persists mcq drafts with answer and options in back_json", async () => {
    const env = createTestEnv();
    await seedOwner(env, true);
    const mcqDraft: CardDraft = {
      type: "mcq",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
      options: ["Adenosine triphosphate", "Adenosine diphosphate", "RNA"],
      provenance: { pages: [1], excerpt: "ATP stores energy" },
    };
    const llm = spyLlm({
      generateDrafts: async () => [mcqDraft],
      complete: async () => JSON.stringify({ cards: [] }),
    });
    const msg = await seedPasteJob(
      env,
      "ATP (adenosine triphosphate) stores cellular energy.",
    );

    await processGenerateJob(env, msg, { llm });

    const cards = env.getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]!.type).toBe("mcq");
    expect(JSON.parse(cards[0]!.back_json)).toEqual({
      answer: "Adenosine triphosphate",
      options: mcqDraft.options,
    });
  });

  it("multi-chunk paste emits generate/critique progress with real total", async () => {
    const env = createTestEnv();
    await seedOwner(env, true);
    const base = mockLlmAdapter();
    const midGenerate: Array<{
      stage: string;
      current: number;
      total: number;
      label: string;
    }> = [];
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(async (input) => {
        const job = env.getGenerationJobs()[0];
        if (job?.progress_json) {
          midGenerate.push(JSON.parse(job.progress_json));
        }
        return base.generateDrafts(input);
      }),
      complete: vi.fn(async (args) => base.complete(args)),
    };

    const block = "x".repeat(3500);
    const msg = await seedPasteJob(env, `${block}\n\n${block}`);

    await processGenerateJob(env, msg, { llm });

    expect(llm.generateDrafts).toHaveBeenCalledTimes(2);
    expect(midGenerate.length).toBeGreaterThanOrEqual(1);
    expect(midGenerate[0]!.stage).toBe("generate");
    expect(midGenerate[0]!.total).toBeGreaterThanOrEqual(2);
    expect(midGenerate[0]!.current).toBe(1);
    expect(midGenerate[0]!.label).toMatch(/chunk 1\//);

    const job = env.getGenerationJobs().find((j) => j.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.progress_json).toBeTruthy();
    const final = JSON.parse(job!.progress_json!) as { stage: string; percent: number };
    expect(final.stage).toBe("persist");
    expect(final.percent).toBe(100);

    // Silence unused import if CHUNK used only for doc — ensure text actually chunks
    expect(`${block}\n\n${block}`.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);
  });
});
