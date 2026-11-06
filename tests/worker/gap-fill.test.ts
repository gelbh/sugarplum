import { describe, expect, it, vi } from "vitest";
import { encryptSecret } from "../../worker/crypto/secrets";
import { processGenerateJob } from "../../worker/generation/consumer";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import { mockLlmAdapter, type LlmAdapter } from "../../worker/generation/llm";
import { RUNNING_JOB_STALE_MS } from "../../worker/generation/progress";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../worker/generation/quota";
import {
  parseCardDrafts,
  type CardDraft,
} from "../../worker/generation/schema";
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

const COVERED_LINE =
  "Mitochondria are the powerhouse of the cell and this covered line stays in the excerpt.";
const GAP_LINE = "Uncovered gap line about the twelfth cranial nerve only.";

function qaDraft(front: string, back: string, excerpt: string): CardDraft {
  return parseCardDrafts([
    {
      type: "qa",
      front,
      back,
      provenance: { pages: [1], excerpt },
    },
  ])[0]!;
}

function gappyLlm(secondThrows = false) {
  const llm = spyLlm();
  llm.complete.mockImplementation(critiqueEchoCandidates());
  let calls = 0;
  llm.generateDrafts.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) {
      return [
        qaDraft(
          "What is the powerhouse of the cell?",
          "Mitochondria.",
          COVERED_LINE,
        ),
      ];
    }
    if (secondThrows) throw new Error("gap-fill model failed");
    return [
      qaDraft("Which cranial nerve is twelve?", "Hypoglossal.", GAP_LINE),
    ];
  });
  return llm;
}

describe("processGenerateJob gap-fill", () => {
  const gappyText = `${COVERED_LINE}\n${GAP_LINE}`;

  it("appends one novel card when gaps remain and autoFollowup is set", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);
    expect(env.getQueueMessages().at(-1)).toMatchObject({ autoFollowup: true });

    const llm = gappyLlm();
    let followupStage = "";
    let calls = 0;
    llm.generateDrafts.mockImplementation(async () => {
      calls += 1;
      if (calls > 1) {
        const job = env.getGenerationJobs().find((row) => row.id === msg.jobId);
        const progress = JSON.parse(job!.progress_json!) as {
          stage: string;
          free_gen_slots?: number;
        };
        followupStage = progress.stage;
        expect(progress.free_gen_slots).toBe(2);
      }
      if (calls === 1) {
        return [
          qaDraft(
            "What is the powerhouse of the cell?",
            "Mitochondria.",
            COVERED_LINE,
          ),
        ];
      }
      return [
        qaDraft("Which cranial nerve is twelve?", "Hypoglossal.", GAP_LINE),
      ];
    });
    llm.complete.mockImplementation(critiqueEchoCandidates());

    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(llm.generateDrafts).toHaveBeenCalledTimes(2);
    expect(followupStage).toBe("persist");
    const second = llm.generateDrafts.mock.calls[1]?.[0] as {
      extraUserSuffix?: string;
    };
    expect(second.extraUserSuffix).toContain(GAP_LINE);
    expect(
      (llm.generateDrafts.mock.calls[0]?.[0] as { extraUserSuffix?: string })
        .extraUserSuffix ?? "",
    ).not.toContain(GAP_LINE);
    const fronts = env.getCards().map((card) => JSON.parse(card.front_json));
    expect(fronts).toEqual([
      "What is the powerhouse of the cell?",
      "Which cranial nerve is twelve?",
    ]);
    const job = env.getGenerationJobs().find((row) => row.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    const progress = JSON.parse(job!.progress_json!) as {
      stage: string;
      percent: number;
      free_gen_slots?: number;
    };
    expect(progress.stage).toBe("persist");
    expect(progress.percent).toBe(100);
    expect(progress.free_gen_slots).toBe(2);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(2);
  });

  it("does not follow up when autoFollowup is omitted or false, or when there are no gaps", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const omitted = await seedPasteJob(env, gappyText);
    const llm = gappyLlm();
    await processGenerateJob(env, omitted, { llm });
    expect(llm.generateDrafts).toHaveBeenCalledOnce();

    const envFalse = createTestEnv();
    await seedOwner(envFalse, false);
    const flagged = await seedPasteJob(envFalse, gappyText);
    const llmFalse = gappyLlm();
    await processGenerateJob(
      envFalse,
      { ...flagged, autoFollowup: false },
      { llm: llmFalse },
    );
    expect(llmFalse.generateDrafts).toHaveBeenCalledOnce();

    const envCovered = createTestEnv();
    await seedOwner(envCovered, false);
    const covered = await seedPasteJob(envCovered, COVERED_LINE);
    const llmCovered = gappyLlm();
    await processGenerateJob(
      envCovered,
      { ...covered, autoFollowup: true },
      { llm: llmCovered },
    );
    expect(llmCovered.generateDrafts).toHaveBeenCalledOnce();
    expect((await getFreeGenUsage(envCovered, "user-a")).used).toBe(1);
  });

  it("keeps pass 1 when the free cap blocks the follow-up", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    for (let i = 0; i < FREE_GEN_DAILY_CAP - 1; i++) {
      await consumeFreeGenSlot(env, "user-a");
    }
    const msg = await seedPasteJob(env, gappyText);
    const llm = gappyLlm();
    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(llm.generateDrafts).toHaveBeenCalledOnce();
    expect(env.getCards()).toHaveLength(1);
    expect(
      env.getGenerationJobs().find((row) => row.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(
      FREE_GEN_DAILY_CAP,
    );
  });

  it("keeps pass 1 when the follow-up model throws", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);
    const llm = gappyLlm(true);
    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(llm.generateDrafts).toHaveBeenCalledTimes(2);
    expect(env.getCards()).toHaveLength(1);
    expect(
      env.getGenerationJobs().find((row) => row.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(2);
  });

  it("does not take a third free slot when the follow-up was already charged", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);
    const job = env.getGenerationJobs().find((row) => row.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    env.seedGenerationJob({
      ...job,
      status: "running",
      progress_json: JSON.stringify({
        updated_at: staleAt,
        stage: "persist",
        current: 1,
        total: 1,
        percent: 100,
        label: "Saving drafts",
        free_gen_charged: true,
        free_gen_slots: 2,
      }),
    });
    await consumeFreeGenSlot(env, "user-a");
    await consumeFreeGenSlot(env, "user-a");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(2);

    const llm = gappyLlm();
    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(llm.generateDrafts).toHaveBeenCalledTimes(2);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(2);
    const progress = JSON.parse(
      env.getGenerationJobs().find((row) => row.id === msg.jobId)!
        .progress_json!,
    ) as { free_gen_slots?: number };
    expect(progress.free_gen_slots).toBe(2);
  });

  it("does not follow up an image job", async () => {
    const env = createTestEnv();
    await seedOwner(env, false);
    const imageKey = "materials/deck-a/mat-img.png";
    env.seedMaterial({
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: imageKey,
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2(imageKey, "fakepng");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-img",
      deckId: "deck-a",
    });
    const llm = spyLlm();
    const result = await processGenerateJob(
      env,
      { jobId, materialId: "mat-img", deckId: "deck-a", autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(llm.generateDrafts).toHaveBeenCalledOnce();
    expect(
      env.getGenerationJobs().find((row) => row.id === jobId)?.status,
    ).toBe("needs_review");
  });
});
