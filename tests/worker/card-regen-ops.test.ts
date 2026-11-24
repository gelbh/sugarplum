import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  COMPOUND_MCQ,
  VALID_CLAIMS,
  VALID_MCQ,
  enqueueAndProcess,
  getCardRegenOps,
  getCardRegenQueueMessages,
  getCards,
  getQueueMessages,
  getRegenOp,
  getSchedules,
  getUsageEvents,
  installQueueRecorders,
  processLatestCardRegen,
  regenRequest,
  resetTestDb,
  seedCard,
  seedCardRegenOp,
  seedCardRegenOwner,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedReviewLog,
  seedSchedule,
  seedSession,
  seedStudyClaim,
  seedThreeDrafts,
  seedUser,
  stubWorkersAiMcq,
  stubWorkersAiSequence,
} from "./harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { capRegenSourceText } from "../../worker/generation/card-regen";
import {
  failStaleCardRegenOps,
  processCardRegenOp,
  STALE_CARD_REGEN_FAIL_ERROR,
} from "../../worker/generation/card-regen-op";
import { studyStrugglePromptSuffix } from "../../worker/generation/feedback-hints";
import { CHUNK_CHAR_LIMIT } from "../../worker/generation/pipeline";
import { RUNNING_JOB_STALE_MS } from "../../worker/generation/progress";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../worker/generation/quota";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../worker/generation/claim-card-fallback";
import { WORKERS_AI_MODEL } from "../../worker/generation/workers-ai";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("POST /api/cards/:id/regen", () => {
  it("retries once with the validation error when the write reply is invalid", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      VALID_CLAIMS,
      "not json at all",
      VALID_MCQ,
    ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(3);
    const writeReask = run.mock.calls[2][1] as {
      messages: { role: string; content: string }[];
    };
    const user = writeReask.messages.find((m) => m.role === "user")!.content;
    expect(user).toMatch(/previous reply was rejected/i);
    expect(
      (await getUsageEvents(env)).filter((e) => e.kind === "regen")[0],
    ).toMatchObject({ tokens_total: 420 });
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });
  it("fails the op with the validation error after two invalid write replies", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      VALID_CLAIMS,
      "not json at all",
      "still not json",
    ]);

    const { body, result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    // extract + specialist write/reask + glm fallback write/reask
    expect(run).toHaveBeenCalledTimes(5);
    const getRes = await getRegenOp(env, body.op.id);
    expect(((await getRes.json()) as { error: string }).error).toMatch(
      /non-JSON/,
    );
    expect(
      JSON.parse((await getCards(env)).find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });
  it("refunds the free slot when Workers AI is at capacity", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = vi.fn(async () => {
      throw Object.assign(new Error("upstream busy"), { status: 429 });
    });
    env.AI = { run } as unknown as Ai;

    const { body, result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    const getRes = await getRegenOp(env, body.op.id);
    expect(((await getRes.json()) as { error: string }).error).toMatch(
      /temporarily at capacity/,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });
  it("reasks once when the first MCQ answer is not among its options", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const badMcq = JSON.stringify({
      cards: [
        {
          type: "mcq",
          front: "Which organelle produces ATP?",
          back: "Chloroplast",
          options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
          provenance: { pages: [1], excerpt: "Mitochondria produce ATP" },
        },
      ],
    });
    const run = stubWorkersAiSequence(env, [VALID_CLAIMS, badMcq, VALID_MCQ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("compact-retries write when the first write reply is truncated mid-JSON", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      VALID_CLAIMS,
      '{"cards":[{"type":"mcq","front":"Which',
      VALID_MCQ,
    ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("fails the op when extract yields no claims", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      JSON.stringify({ claims: [] }),
      VALID_MCQ,
    ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse((await getCards(env)).find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });
  it("fails the op when Layer-1 rejects the card after quality reask", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      VALID_CLAIMS,
      COMPOUND_MCQ,
      COMPOUND_MCQ,
    ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(
      JSON.parse((await getCards(env)).find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });
  it("returns the same op id on a second POST while in flight", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    stubWorkersAiMcq(env);

    const first = await regenRequest(env);
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as {
      op: { id: string; status: string };
    };
    expect(firstBody.op.status).toBe("queued");

    const second = await regenRequest(env);
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as { op: { id: string } };
    expect(secondBody.op.id).toBe(firstBody.op.id);
    expect((await getCardRegenOps(env))).toHaveLength(1);
    // Second POST re-enqueues while still queued (lost-message recovery).
    expect(getCardRegenQueueMessages()).toHaveLength(2);
    expect(getQueueMessages()).toHaveLength(0);
  });
  it("processCardRegenOp is idempotent after done", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiMcq(env);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    const callsAfterFirst = run.mock.calls.length;
    const again = await processLatestCardRegen(env);
    expect(again).toBe("done");
    expect(run.mock.calls.length).toBe(callsAfterFirst);
    expect((await getUsageEvents(env)).filter((e) => e.kind === "regen")).toHaveLength(
      1,
    );
  });
  it("fails stale running card regen ops", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    const staleCreated = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 60_000,
    ).toISOString();
    await seedCardRegenOp(env, {
      id: "op-stale",
      card_id: "c-mid",
      user_id: "user-a",
      regen_type: "mcq",
      status: "running",
      error: null,
      created_at: staleCreated,
      finished_at: null,
    });

    const failed = await failStaleCardRegenOps(env);
    expect(failed).toBe(1);
    const op = (await getCardRegenOps(env)).find((o) => o.id === "op-stale")!;
    expect(op.status).toBe("failed");
    expect(op.error).toBe(STALE_CARD_REGEN_FAIL_ERROR);
  });
});
