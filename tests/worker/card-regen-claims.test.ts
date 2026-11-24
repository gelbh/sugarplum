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
  it("skips extract when card has claim_id and keeps claim_id after update", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedStudyClaim(env, {
      id: "cl-mid",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Mitochondria",
      predicate: "produce ATP",
      source_span: "Mitochondria produce ATP",
      object: "ATP",
      qualifiers_json: null,
      pages_json: JSON.stringify([1]),
      created_at: "2026-01-01T01:06:00.000Z",
    });
    const mid = (await getCards(env)).find((c) => c.id === "c-mid")!;
    await seedCard(env, { ...mid, claim_id: "cl-mid" });
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");

    const run = vi.fn(async (_model: string, input: unknown) => {
      expect(_model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
      const messages = (
        input as { messages?: Array<{ role: string; content: string }> }
      ).messages;
      const system = messages?.find((m) => m.role === "system")?.content ?? "";
      expect(system.toLowerCase()).not.toMatch(/extract/);
      expect(system.toLowerCase()).toMatch(/flashcard|claim|write/);
      return {
        choices: [
          {
            index: 0,
            message: { role: "assistant" as const, content: VALID_MCQ },
            finish_reason: "stop" as const,
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      };
    });
    env.AI = { run } as unknown as Ai;

    const { body, result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalled();
    const updated = (await getCards(env)).find((c) => c.id === "c-mid")!;
    expect(updated.claim_id).toBe("cl-mid");
    expect(JSON.parse(updated.front_json)).toBe(
      "Which organelle produces ATP?",
    );
    const getRes = await getRegenOp(env, body.op.id);
    expect(getRes.status).toBe(200);
    const opBody = (await getRes.json()) as {
      status: string;
      card?: { front: string };
    };
    expect(opBody.status).toBe("done");
    expect(opBody.card?.front).toBe("Which organelle produces ATP?");
  });
  it("resolves claim by exact excerpt when claim_id is null and heals claim_id", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedStudyClaim(env, {
      id: "cl-orphan",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Mitochondria",
      predicate: "produce ATP",
      source_span: "Mitochondria produce ATP",
      object: "ATP",
      qualifiers_json: null,
      pages_json: JSON.stringify([1]),
      created_at: "2026-01-01T01:06:00.000Z",
    });
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = vi.fn(async (_model: string, input: unknown) => {
      const messages = (
        input as { messages?: Array<{ role: string; content: string }> }
      ).messages;
      const system = messages?.find((m) => m.role === "system")?.content ?? "";
      expect(system.toLowerCase()).not.toMatch(/extract/);
      return {
        choices: [
          {
            index: 0,
            message: { role: "assistant" as const, content: VALID_MCQ },
            finish_reason: "stop" as const,
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      };
    });
    env.AI = { run } as unknown as Ai;

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect((await getCards(env)).find((c) => c.id === "c-mid")!.claim_id).toBe(
      "cl-orphan",
    );
  });
  it("heals dangling claim_id when excerpt matches another study_claims row", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedStudyClaim(env, {
      id: "cl-real",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Mitochondria",
      predicate: "produce ATP",
      source_span: "Mitochondria produce ATP",
      object: "ATP",
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T01:06:00.000Z",
    });
    // Real D1 cannot store a missing claim_id FK. Cross-deck claim_id hits the
    // same resolve path (SELECT id + deck_id → miss → excerpt heal).
    await seedDeck(env, {
      id: "deck-other",
      user_id: "user-a",
      title: "Other",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-other",
      deck_id: "deck-other",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-other",
      material_id: "mat-other",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });
    await seedStudyClaim(env, {
      id: "cl-missing",
      job_id: "job-other",
      deck_id: "deck-other",
      subject: "Gone",
      predicate: "missing",
      source_span: "gone",
      object: null,
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T01:05:00.000Z",
    });
    const mid = (await getCards(env)).find((c) => c.id === "c-mid")!;
    await seedCard(env, { ...mid, claim_id: "cl-missing" });
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [VALID_MCQ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect((await getCards(env)).find((c) => c.id === "c-mid")!.claim_id).toBe(
      "cl-real",
    );
  });
  it("uses matched claim for write but does not steal claim_id owned by a sibling", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedStudyClaim(env, {
      id: "cl-owned",
      job_id: "job-a",
      deck_id: "deck-a",
      subject: "Mitochondria",
      predicate: "produce ATP",
      source_span: "Mitochondria produce ATP",
      object: "ATP",
      qualifiers_json: null,
      pages_json: null,
      created_at: "2026-01-01T01:06:00.000Z",
    });
    const left = (await getCards(env)).find((c) => c.id === "c-left")!;
    await seedCard(env, { ...left, claim_id: "cl-owned" });
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [VALID_MCQ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect((await getCards(env)).find((c) => c.id === "c-mid")!.claim_id ?? null).toBe(
      null,
    );
    expect((await getCards(env)).find((c) => c.id === "c-left")!.claim_id).toBe(
      "cl-owned",
    );
  });
});
