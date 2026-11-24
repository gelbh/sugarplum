import { env as cfEnv } from "cloudflare:workers";
import {
  critiqueEchoCandidates,
  critiqueKeepFronts,
  getCards,
  getGenerationJobs,
  resetTestDb,
  seedConsumerOwner,
  seedPasteJob,
  spyLlm,
} from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { processGenerateJob } from "../../worker/generation/consumer";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../worker/generation/quota";
import { type CardDraft } from "../../worker/generation/schema";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("processGenerateJob free path", () => {

  it("no secret + mock llm → needs_review and records free-gen", async () => {
    const env = cfEnv;
    await seedConsumerOwner(env, false);
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
    await seedConsumerOwner(env, false);
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
    await seedConsumerOwner(env, false);
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
    await seedConsumerOwner(env, true);
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
    await seedConsumerOwner(env, false);
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
    await seedConsumerOwner(env, false);
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
    await seedConsumerOwner(env, false);
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
    await seedConsumerOwner(env, true);
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
});
