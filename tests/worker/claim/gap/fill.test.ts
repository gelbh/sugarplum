import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
  seedUserSecret,
  TEST_SECRETS_WRAP_KEY,
} from "../../harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "../../../../worker/crypto/secrets";
import { processGenerateJob } from "../../../../worker/generation/consumer";
import { enqueueGeneration } from "../../../../worker/generation/enqueue";
import { mockLlmAdapter, type LlmAdapter } from "../../../../worker/generation/llm";
import { RUNNING_JOB_STALE_MS } from "../../../../worker/generation/progress";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../../../worker/generation/quota";
import {
  parseCardDrafts,
  type CardDraft,
} from "../../../../worker/generation/schema";

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

function isClaimExtract(system: string): boolean {
  const s = system.toLowerCase();
  return s.includes("extract") && s.includes("claim");
}

function isClaimGapExtract(system: string): boolean {
  return isClaimExtract(system) && system.toLowerCase().includes("uncovered");
}

function extractPassCount(llm: { complete: ReturnType<typeof vi.fn> }): number {
  return llm.complete.mock.calls.filter((c) =>
    isClaimExtract((c[0] as { system: string }).system),
  ).length;
}

function extractUsers(llm: { complete: ReturnType<typeof vi.fn> }): string[] {
  return llm.complete.mock.calls
    .filter((c) => isClaimExtract((c[0] as { system: string }).system))
    .map((c) => (c[0] as { user: string }).user);
}

const COVERED_DRAFT = () =>
  qaDraft(
    "What is the powerhouse of the cell?",
    "Mitochondria.",
    COVERED_LINE,
  );
const GAP_DRAFT = () =>
  qaDraft("Which cranial nerve is twelve?", "Hypoglossal.", GAP_LINE);

/**
 * Pass-1 main extract covers COVERED_LINE; claim-gap extract covers GAP_LINE.
 * Write emits one card per claim in the user payload. Draft autoFollowup is a
 * no-op once both lines are claimed and carded.
 */
function gappyLlm(
  gapThrows = false,
  onClaimGapExtract?: () => void,
): LlmAdapter & {
  generateDrafts: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
} {
  const llm = spyLlm();
  llm.generateDrafts.mockImplementation(async () => {
    throw new Error("generateDrafts must not be called for text claim path");
  });
  llm.complete.mockImplementation(async ({ system, user }) => {
    const s = system.toLowerCase();
    if (isClaimGapExtract(system)) {
      onClaimGapExtract?.();
      if (gapThrows) {
        throw new Error("claim gap extract failed");
      }
      return {
        text: JSON.stringify({
          claims: [
            {
              subject: "Twelfth cranial nerve",
              predicate: "is the hypoglossal",
              source_span: GAP_LINE,
              pages: [1],
            },
          ],
        }),
        usage: null,
      };
    }
    if (isClaimExtract(system)) {
      return {
        text: JSON.stringify({
          claims: [
            {
              subject: "Mitochondria",
              predicate: "are the powerhouse of the cell",
              source_span: COVERED_LINE,
              pages: [1],
            },
          ],
        }),
        usage: null,
      };
    }
    if (s.includes("critique")) {
      // Match card fronts in the critique payload, not material lines.
      const cards: CardDraft[] = [];
      if (user.includes("What is the powerhouse of the cell?")) {
        cards.push(COVERED_DRAFT());
      }
      if (user.includes("Which cranial nerve is twelve?")) {
        cards.push(GAP_DRAFT());
      }
      return {
        text: JSON.stringify({
          cards: cards.length > 0 ? cards : [COVERED_DRAFT()],
        }),
        usage: null,
      };
    }
    // Card-from-claim write: match claim payloads, not ambient material.
    const cards: CardDraft[] = [];
    if (user.includes(COVERED_LINE) || user.includes('"Mitochondria"')) {
      cards.push(COVERED_DRAFT());
    }
    if (user.includes(GAP_LINE) || user.includes('"Twelfth cranial nerve"')) {
      cards.push(GAP_DRAFT());
    }
    return {
      text: JSON.stringify({
        cards: cards.length > 0 ? cards : [COVERED_DRAFT()],
      }),
      usage: null,
    };
  });
  return llm;
}

describe("processGenerateJob gap-fill", () => {
  const gappyText = `${COVERED_LINE}\n${GAP_LINE}`;

  it("appends a claim-gap card in pass 1 without a second free slot", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);
    expect(getQueueMessages().at(-1)).toMatchObject({ autoFollowup: true });

    let gapStage = "";
    const llm = gappyLlm(false, async () => {
      const job = (await getGenerationJobs(env)).find((row) => row.id === msg.jobId);
      const progress = JSON.parse(job!.progress_json!) as {
        stage: string;
        free_gen_slots?: number;
      };
      gapStage = progress.stage;
      expect(progress.free_gen_slots).toBe(1);
    });

    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(llm.generateDrafts).not.toHaveBeenCalled();
    // Main extract + claim-gap extract; draft autoFollowup is a no-op.
    expect(extractPassCount(llm)).toBe(2);
    expect(gapStage).toBe("claims");
    const users = extractUsers(llm);
    expect(users[0]).toContain(COVERED_LINE);
    expect(users[1]).toContain(GAP_LINE);
    expect(users[1]).not.toContain(COVERED_LINE);
    const fronts = (await getCards(env)).map((card) => JSON.parse(card.front_json));
    expect(fronts).toEqual([
      "What is the powerhouse of the cell?",
      "Which cranial nerve is twelve?",
    ]);
    const job = (await getGenerationJobs(env)).find((row) => row.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    const progress = JSON.parse(job!.progress_json!) as {
      stage: string;
      percent: number;
      free_gen_slots?: number;
    };
    // Claim-gap closed coverage; draft follow-up soft-skips enrich 0→1.
    expect(progress.stage).toBe("enrich");
    expect(progress.percent).toBe(100);
    expect(progress.free_gen_slots).toBe(1);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });

  it("still claim-gap extracts when autoFollowup is omitted; skips when no claim gaps", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env, false);
    const omitted = await seedPasteJob(env, gappyText);
    const llm = gappyLlm();
    await processGenerateJob(env, omitted, { llm });
    expect(extractPassCount(llm)).toBe(2);

    await resetTestDb(cfEnv);
    const envFalse = installQueueRecorders(cfEnv);
    await seedOwner(envFalse, false);
    const flagged = await seedPasteJob(envFalse, gappyText);
    const llmFalse = gappyLlm();
    await processGenerateJob(
      envFalse,
      { ...flagged, autoFollowup: false },
      { llm: llmFalse },
    );
    expect(extractPassCount(llmFalse)).toBe(2);

    await resetTestDb(cfEnv);
    const envCovered = installQueueRecorders(cfEnv);
    await seedOwner(envCovered, false);
    const covered = await seedPasteJob(envCovered, COVERED_LINE);
    const llmCovered = gappyLlm();
    await processGenerateJob(
      envCovered,
      { ...covered, autoFollowup: true },
      { llm: llmCovered },
    );
    expect(extractPassCount(llmCovered)).toBe(1);
    expect((await getFreeGenUsage(envCovered, "user-a")).used).toBe(1);
  });

  it("claim-gap fills in pass 1 even when the free cap would block draft follow-up", async () => {
    const env = installQueueRecorders(cfEnv);
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
    expect(extractPassCount(llm)).toBe(2);
    expect((await getCards(env))).toHaveLength(2);
    expect(
      (await getGenerationJobs(env)).find((row) => row.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(
      FREE_GEN_DAILY_CAP,
    );
    const progress = JSON.parse(
      (await getGenerationJobs(env)).find((row) => row.id === msg.jobId)!
        .progress_json!,
    ) as { free_gen_slots?: number };
    expect(progress.free_gen_slots).toBe(1);
  });

  it("keeps pass 1 when claim-gap throws and draft follow-up also fails", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);
    const llm = gappyLlm(true);
    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    // Pass-1 main + failed claim-gap, then draft follow-up main + failed claim-gap.
    expect(extractPassCount(llm)).toBe(4);
    expect((await getCards(env))).toHaveLength(1);
    expect(
      (await getGenerationJobs(env)).find((row) => row.id === msg.jobId)?.status,
    ).toBe("needs_review");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(2);
  });

  it("emits enrich progress during draft gap-fill follow-up", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);

    let claimGapExtracts = 0;
    let enrichDuringFollowup = false;
    let percentDuringFollowup = 100;
    const llm = gappyLlm(true, async () => {
      claimGapExtracts += 1;
      if (claimGapExtracts < 2) return;
      const job = (await getGenerationJobs(env)).find((row) => row.id === msg.jobId);
      const progress = JSON.parse(job!.progress_json!) as {
        stage: string;
        percent: number;
      };
      expect(progress.stage).toBe("enrich");
      expect(progress.percent).toBeLessThan(100);
      enrichDuringFollowup = true;
      percentDuringFollowup = progress.percent;
    });

    const result = await processGenerateJob(
      env,
      { ...msg, autoFollowup: true },
      { llm },
    );

    expect(result).toBe("done");
    expect(claimGapExtracts).toBeGreaterThanOrEqual(2);
    expect(enrichDuringFollowup).toBe(true);
    expect(percentDuringFollowup).toBeLessThan(100);
    const job = (await getGenerationJobs(env)).find((row) => row.id === msg.jobId);
    expect(job?.status).toBe("needs_review");
    const progress = JSON.parse(job!.progress_json!) as {
      stage: string;
      percent: number;
    };
    expect(progress.stage).toBe("enrich");
    expect(progress.percent).toBe(100);
  });

  it("does not take a third free slot when two slots were already charged", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env, false);
    const msg = await seedPasteJob(env, gappyText);
    const job = (await getGenerationJobs(env)).find((row) => row.id === msg.jobId)!;
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    await seedGenerationJob(env, {
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
    // Reclaim re-runs pass 1 (main + claim-gap); draft follow-up stays a no-op.
    expect(extractPassCount(llm)).toBe(2);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(2);
    const progress = JSON.parse(
      (await getGenerationJobs(env)).find((row) => row.id === msg.jobId)!
        .progress_json!,
    ) as { free_gen_slots?: number };
    expect(progress.free_gen_slots).toBe(2);
  });

  it("does not follow up an image job", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env, false);
    const imageKey = "materials/deck-a/mat-img.png";
    await seedMaterial(env, {
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: imageKey,
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, imageKey, "fakepng");
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
      (await getGenerationJobs(env)).find((row) => row.id === jobId)?.status,
    ).toBe("needs_review");
  });
});
