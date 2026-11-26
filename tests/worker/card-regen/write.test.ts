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
} from "../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { capRegenSourceText } from "../../../worker/generation/card-regen";
import {
  failStaleCardRegenOps,
  processCardRegenOp,
  STALE_CARD_REGEN_FAIL_ERROR,
} from "../../../worker/generation/card-regen-op";
import { studyStrugglePromptSuffix } from "../../../worker/generation/feedback-hints";
import { CHUNK_CHAR_LIMIT } from "../../../worker/generation/pipeline";
import { RUNNING_JOB_STALE_MS } from "../../../worker/generation/progress";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../../worker/generation/quota";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../../worker/generation/claim-card-fallback";
import { WORKERS_AI_MODEL } from "../../../worker/generation/workers-ai";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("POST /api/cards/:id/regen", () => {
  it("regenerates middle draft as mcq and leaves sibling fronts intact", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, 
      "materials/deck-a/mat-a.txt",
      "Mitochondria produce ATP in eukaryotic cells.",
    );
    const run = stubWorkersAiMcq(env);

    const { body, result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    const getRes = await getRegenOp(env, body.op.id);
    const opBody = (await getRes.json()) as {
      status: string;
      card?: {
        id: string;
        type: string;
        front: string;
        back: string;
        options?: string[];
        status: string;
        job_id: string | null;
      };
    };
    expect(opBody.status).toBe("done");
    expect(opBody.card).toMatchObject({
      id: "c-mid",
      type: "mcq",
      status: "draft",
      job_id: "job-a",
      front: "Which organelle produces ATP?",
      back: "Mitochondria",
    });
    expect(opBody.card?.options).toEqual([
      "Mitochondria",
      "Nucleus",
      "Ribosome",
      "Golgi",
    ]);
    expect(run).toHaveBeenCalled();

    const cards = (await getCards(env)).filter((c) => c.job_id === "job-a");
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.id).sort()).toEqual([
      "c-left",
      "c-mid",
      "c-right",
    ]);

    const left = cards.find((c) => c.id === "c-left")!;
    const right = cards.find((c) => c.id === "c-right")!;
    const mid = cards.find((c) => c.id === "c-mid")!;
    expect(JSON.parse(left.front_json)).toBe("Left front?");
    expect(JSON.parse(right.front_json)).toBe("Right {{c1::blank}}.");
    expect(mid.type).toBe("mcq");
    expect(JSON.parse(mid.front_json)).toBe("Which organelle produces ATP?");

    const regenEvents = (await getUsageEvents(env)).filter((e) => e.kind === "regen");
    expect(regenEvents).toHaveLength(1);
    expect(regenEvents[0]).toMatchObject({
      user_id: "user-a",
      job_id: null,
      kind: "regen",
      path: "free",
      provider: "workers-ai",
      tokens_prompt: 200,
      tokens_completion: 80,
      tokens_total: 280,
    });
  });
  it("fails the op when free-gen daily cap is exhausted on workers-ai", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    stubWorkersAiMcq(env);
    for (let i = 0; i < FREE_GEN_DAILY_CAP; i++) {
      await consumeFreeGenSlot(env, "user-a");
    }

    const { body, result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    const getRes = await getRegenOp(env, body.op.id);
    const opBody = (await getRes.json()) as {
      status: string;
      error: string | null;
    };
    expect(opBody.status).toBe("failed");
    expect(opBody.error).toMatch(/Daily free generation limit/i);
    expect((await getUsageEvents(env)).filter((e) => e.kind === "regen")).toHaveLength(
      0,
    );
    expect(
      JSON.parse((await getCards(env)).find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
  });
  it("prefers provenance excerpt over oversized material as extract corpus", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    const huge = `${"Mitochondria produce ATP. ".repeat(400)}${"X".repeat(CHUNK_CHAR_LIMIT)}`;
    expect(huge.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);
    await seedR2(env, "materials/deck-a/mat-a.txt", huge);
    const run = stubWorkersAiMcq(env);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalled();
    const body = run.mock.calls[0]![1] as {
      messages?: { role: string; content: string }[];
    };
    const userMsg =
      body.messages?.find((m) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain("Mitochondria produce ATP");
    expect(userMsg).not.toContain("XXXX");
    expect(capRegenSourceText(huge).length).toBe(CHUNK_CHAR_LIMIT);
  });
  it("clears media_r2_keys when regenerating a visual card as text", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedGenerationJob(env, {
      id: "job-vis",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "c-vis",
      deck_id: "deck-a",
      job_id: "job-vis",
      type: "image_label",
      front_json: JSON.stringify("Label the organelle"),
      back_json: JSON.stringify("Mitochondria"),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/fig.png"]),
      provenance_json: JSON.stringify({
        pages: [1],
        excerpt: "Mitochondria produce ATP",
      }),
      status: "draft",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    await seedR2(env, 
      "materials/deck-a/mat-a.txt",
      "Mitochondria produce ATP in eukaryotic cells.",
    );
    stubWorkersAiMcq(env);

    const { body, result } = await enqueueAndProcess(env, "c-vis");
    expect(result).toBe("done");
    const getRes = await getRegenOp(env, body.op.id);
    const opBody = (await getRes.json()) as {
      card?: { type: string; media_r2_keys?: string[] };
    };
    expect(opBody.card?.type).toBe("mcq");
    expect(opBody.card?.media_r2_keys ?? []).toEqual([]);
    expect(
      (await getCards(env)).find((c) => c.id === "c-vis")!.media_r2_keys_json,
    ).toBe(null);
  });
  it("returns 422 when provenance and material text are both missing", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedGenerationJob(env, {
      id: "job-empty",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "c-nosource",
      deck_id: "deck-a",
      job_id: "job-empty",
      type: "qa",
      front_json: JSON.stringify("Orphan Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "" }),
      status: "draft",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    stubWorkersAiMcq(env);

    const res = await app.request(
      "/api/cards/c-nosource/regen",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ type: "qa" }),
      },
      env,
    );
    expect(res.status).toBe(422);
    const midBefore = (await getCards(env)).find((c) => c.id === "c-nosource")!;
    expect(midBefore.type).toBe("qa");
    expect(JSON.parse(midBefore.front_json)).toBe("Orphan Q?");
  });
  it("returns 404 for non-owner", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedThreeDrafts(env);
    await seedR2(env, "materials/deck-a/mat-a.txt", "source text");
    stubWorkersAiMcq(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/cards/c-mid/regen",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ type: "mcq" }),
      },
      env,
    );
    expect(res.status).toBe(404);
    expect((await getCards(env))).toHaveLength(3);
  });
  it("accepted regen keeps schedule due unchanged", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedGenerationJob(env, {
      id: "job-acc",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "c-acc",
      deck_id: "deck-a",
      job_id: "job-acc",
      type: "qa",
      front_json: JSON.stringify("Accepted Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({
        pages: [1],
        excerpt: "Mitochondria produce ATP",
      }),
      status: "accepted",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    const due = "2026-03-15T12:00:00.000Z";
    await seedSchedule(env, {
      card_id: "c-acc",
      due,
      stability: 2.5,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 3,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: "2026-03-12T12:00:00.000Z",
    });
    await seedR2(env, 
      "materials/deck-a/mat-a.txt",
      "Mitochondria produce ATP in eukaryotic cells.",
    );
    stubWorkersAiMcq(env);

    const { body, result } = await enqueueAndProcess(env, "c-acc");
    expect(result).toBe("done");
    const getRes = await getRegenOp(env, body.op.id);
    const opBody = (await getRes.json()) as {
      card?: { status: string; type: string };
    };
    expect(opBody.card?.status).toBe("accepted");
    expect(opBody.card?.type).toBe("mcq");
    expect((await getSchedules(env))).toHaveLength(1);
    expect((await getSchedules(env))[0]!.due).toBe(due);
    expect((await getSchedules(env))[0]!.reps).toBe(2);
  });
  it("includes study struggle text in the regen prompt when again/lapses > 0", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedCardRegenOwner(env);
    await seedGenerationJob(env, {
      id: "job-struggle",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "c-struggle",
      deck_id: "deck-a",
      job_id: "job-struggle",
      type: "qa",
      front_json: JSON.stringify("Struggle Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({
        pages: [1],
        excerpt: "Mitochondria produce ATP",
      }),
      status: "accepted",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "c-struggle",
      due: "2026-03-15T12:00:00.000Z",
      stability: 2.5,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 3,
      learning_steps: 0,
      reps: 2,
      lapses: 2,
      state: 2,
      last_review: "2026-03-12T12:00:00.000Z",
    });
    await seedReviewLog(env, {
      id: "rl-struggle-1",
      card_id: "c-struggle",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: new Date().toISOString(),
      state_json: "{}",
    });
    await seedR2(env, 
      "materials/deck-a/mat-a.txt",
      "Mitochondria produce ATP in eukaryotic cells.",
    );
    const run = stubWorkersAiMcq(env);

    const { result } = await enqueueAndProcess(env, "c-struggle");
    expect(result).toBe("done");
    expect(run).toHaveBeenCalled();
    const expected = studyStrugglePromptSuffix({ again_14d: 1, lapses: 2 });
    expect(expected.length).toBeGreaterThan(0);
    const anyUser = run.mock.calls.some((call) => {
      const body = call[1] as {
        messages?: { role: string; content: string }[];
      };
      const userMsg =
        body.messages?.find((m) => m.role === "user")?.content ?? "";
      return userMsg.includes(expected);
    });
    expect(anyUser).toBe(true);
  });
});
