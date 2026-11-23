import { describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { capRegenSourceText } from "../../worker/generation/card-regen";
import {
  failStaleCardRegenOps,
  processCardRegenOp,
  STALE_CARD_REGEN_FAIL_ERROR,
} from "../../worker/generation/card-regen-op";
import type { CardRegenQueueMessage } from "../../worker/generation/enqueue";
import { studyStrugglePromptSuffix } from "../../worker/generation/feedback-hints";
import { CHUNK_CHAR_LIMIT } from "../../worker/generation/pipeline";
import { RUNNING_JOB_STALE_MS } from "../../worker/generation/progress";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
  getFreeGenUsage,
} from "../../worker/generation/quota";
import {
  WORKERS_AI_CLAIM_CARD_MODEL,
  WORKERS_AI_MODEL,
} from "../../worker/generation/workers-ai";
import { createTestEnv } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
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
  env.seedMaterial({
    id: "mat-a",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-a.txt",
    filename: "notes.txt",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function seedThreeDrafts(env: ReturnType<typeof createTestEnv>) {
  env.seedGenerationJob({
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
  env.seedCard({
    id: "c-left",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "qa",
    front_json: JSON.stringify("Left front?"),
    back_json: JSON.stringify("Left back"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({
      pages: [1],
      excerpt: "Mitochondria produce ATP",
    }),
    status: "draft",
    created_at: "2026-01-01T01:06:00.000Z",
    updated_at: "2026-01-01T01:06:00.000Z",
  });
  env.seedCard({
    id: "c-mid",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "qa",
    front_json: JSON.stringify("Middle front?"),
    back_json: JSON.stringify("Middle back"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({
      pages: [1],
      excerpt: "Mitochondria produce ATP",
    }),
    status: "draft",
    created_at: "2026-01-01T01:07:00.000Z",
    updated_at: "2026-01-01T01:07:00.000Z",
  });
  env.seedCard({
    id: "c-right",
    deck_id: "deck-a",
    job_id: "job-a",
    type: "cloze",
    front_json: JSON.stringify("Right {{c1::blank}}."),
    back_json: JSON.stringify("blank"),
    media_r2_keys_json: null,
    provenance_json: JSON.stringify({
      pages: [1],
      excerpt: "Mitochondria produce ATP",
    }),
    status: "draft",
    created_at: "2026-01-01T01:08:00.000Z",
    updated_at: "2026-01-01T01:08:00.000Z",
  });
}

const VALID_CLAIMS = JSON.stringify({
  claims: [
    {
      subject: "Mitochondria",
      predicate: "produce ATP",
      object: "ATP",
      source_span: "Mitochondria produce ATP",
    },
  ],
});

const VALID_MCQ = JSON.stringify({
  cards: [
    {
      type: "mcq",
      front: "Which organelle produces ATP?",
      back: "Mitochondria",
      options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
      provenance: { pages: [1], excerpt: "Mitochondria produce ATP" },
    },
  ],
});

/** Valid MCQ shape that Layer-1 drops (compound front). */
const COMPOUND_MCQ = JSON.stringify({
  cards: [
    {
      type: "mcq",
      front:
        "What is mitochondria and which pathway and how does ATP work versus glycolysis?",
      back: "Mitochondria",
      options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
      provenance: { pages: [1], excerpt: "Mitochondria produce ATP" },
    },
  ],
});

function stubWorkersAiSequence(
  env: ReturnType<typeof createTestEnv>,
  contents: string[],
) {
  let i = 0;
  const run = vi.fn(async (_model: string, _input: unknown) => {
    expect([WORKERS_AI_CLAIM_CARD_MODEL, WORKERS_AI_MODEL]).toContain(_model);
    return {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: contents[Math.min(i++, contents.length - 1)],
          },
          finish_reason: "stop" as const,
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    };
  });
  env.AI = { run } as unknown as Ai;
  return run;
}

/** Happy path: extract claims, then write one typed card. */
function stubWorkersAiMcq(env: ReturnType<typeof createTestEnv>) {
  return stubWorkersAiSequence(env, [VALID_CLAIMS, VALID_MCQ]);
}

function regenRequest(
  env: ReturnType<typeof createTestEnv>,
  cardId = "c-mid",
  type = "mcq",
  cookie = "sess-a",
) {
  return app.request(
    `/api/cards/${cardId}/regen`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${cookie}`,
      },
      body: JSON.stringify({ type }),
    },
    env,
  );
}

function latestCardRegenMessage(
  env: ReturnType<typeof createTestEnv>,
): CardRegenQueueMessage {
  const msgs = env.getCardRegenQueueMessages() as CardRegenQueueMessage[];
  const last = msgs[msgs.length - 1];
  if (!last) throw new Error("expected cardRegen queue message");
  return last;
}

async function processLatestCardRegen(env: ReturnType<typeof createTestEnv>) {
  return processCardRegenOp(env, latestCardRegenMessage(env));
}

async function getRegenOp(
  env: ReturnType<typeof createTestEnv>,
  opId: string,
  cookie = "sess-a",
) {
  return app.request(
    `/api/card-regen-ops/${opId}`,
    {
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    },
    env,
  );
}

async function enqueueAndProcess(
  env: ReturnType<typeof createTestEnv>,
  cardId = "c-mid",
  type = "mcq",
) {
  const res = await regenRequest(env, cardId, type);
  expect(res.status).toBe(202);
  const body = (await res.json()) as {
    op: { id: string; status: string; cardId: string };
  };
  const result = await processLatestCardRegen(env);
  return { body, result };
}

describe("POST /api/cards/:id/regen", () => {
  it("skips extract when card has claim_id and keeps claim_id after update", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedStudyClaim({
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
    const mid = env.getCards().find((c) => c.id === "c-mid")!;
    env.seedCard({ ...mid, claim_id: "cl-mid" });
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");

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
    const updated = env.getCards().find((c) => c.id === "c-mid")!;
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
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedStudyClaim({
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
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
    expect(env.getCards().find((c) => c.id === "c-mid")!.claim_id).toBe(
      "cl-orphan",
    );
  });

  it("heals dangling claim_id when excerpt matches another study_claims row", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedStudyClaim({
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
    const mid = env.getCards().find((c) => c.id === "c-mid")!;
    env.seedCard({ ...mid, claim_id: "cl-missing" });
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [VALID_MCQ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect(env.getCards().find((c) => c.id === "c-mid")!.claim_id).toBe(
      "cl-real",
    );
  });

  it("uses matched claim for write but does not steal claim_id owned by a sibling", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedStudyClaim({
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
    const left = env.getCards().find((c) => c.id === "c-left")!;
    env.seedCard({ ...left, claim_id: "cl-owned" });
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [VALID_MCQ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
    expect(env.getCards().find((c) => c.id === "c-mid")!.claim_id ?? null).toBe(
      null,
    );
    expect(env.getCards().find((c) => c.id === "c-left")!.claim_id).toBe(
      "cl-owned",
    );
  });

  it("regenerates middle draft as mcq and leaves sibling fronts intact", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2(
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

    const cards = env.getCards().filter((c) => c.job_id === "job-a");
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

    const regenEvents = env.getUsageEvents().filter((e) => e.kind === "regen");
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
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
    expect(env.getUsageEvents().filter((e) => e.kind === "regen")).toHaveLength(
      0,
    );
    expect(
      JSON.parse(env.getCards().find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
  });

  it("prefers provenance excerpt over oversized material as extract corpus", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    const huge = `${"Mitochondria produce ATP. ".repeat(400)}${"X".repeat(CHUNK_CHAR_LIMIT)}`;
    expect(huge.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);
    env.seedR2("materials/deck-a/mat-a.txt", huge);
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
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
      id: "job-vis",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    env.seedCard({
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
    env.seedR2(
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
      env.getCards().find((c) => c.id === "c-vis")!.media_r2_keys_json,
    ).toBe(null);
  });

  it("returns 422 when provenance and material text are both missing", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
      id: "job-empty",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    env.seedCard({
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
    const midBefore = env.getCards().find((c) => c.id === "c-nosource")!;
    expect(midBefore.type).toBe("qa");
    expect(JSON.parse(midBefore.front_json)).toBe("Orphan Q?");
  });

  it("returns 404 for non-owner", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "source text");
    stubWorkersAiMcq(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

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
    expect(env.getCards()).toHaveLength(3);
  });

  it("accepted regen keeps schedule due unchanged", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
      id: "job-acc",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedR2(
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
    expect(env.getSchedules()).toHaveLength(1);
    expect(env.getSchedules()[0]!.due).toBe(due);
    expect(env.getSchedules()[0]!.reps).toBe(2);
  });

  it("includes study struggle text in the regen prompt when again/lapses > 0", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
      id: "job-struggle",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    env.seedCard({
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
    env.seedSchedule({
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
    env.seedReviewLog({
      id: "rl-struggle-1",
      card_id: "c-struggle",
      rating: 1,
      scheduled_days: 1,
      elapsed_days: 0,
      reviewed_at: new Date().toISOString(),
      state_json: "{}",
    });
    env.seedR2(
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

  it("retries once with the validation error when the write reply is invalid", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
      env.getUsageEvents().filter((e) => e.kind === "regen")[0],
    ).toMatchObject({ tokens_total: 420 });
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });

  it("fails the op with the validation error after two invalid write replies", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
      JSON.parse(env.getCards().find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(1);
  });

  it("refunds the free slot when Workers AI is at capacity", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      JSON.stringify({ claims: [] }),
      VALID_MCQ,
    ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(env.getCards().find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });

  it("fails the op when Layer-1 rejects the card after quality reask", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiSequence(env, [
      VALID_CLAIMS,
      COMPOUND_MCQ,
      COMPOUND_MCQ,
    ]);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("failed");
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(
      JSON.parse(env.getCards().find((c) => c.id === "c-mid")!.front_json),
    ).toBe("Middle front?");
    expect((await getFreeGenUsage(env, "user-a")).used).toBe(0);
  });

  it("returns the same op id on a second POST while in flight", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
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
    expect(env.getCardRegenOps()).toHaveLength(1);
    // Second POST re-enqueues while still queued (lost-message recovery).
    expect(env.getCardRegenQueueMessages()).toHaveLength(2);
    expect(env.getQueueMessages()).toHaveLength(0);
  });

  it("processCardRegenOp is idempotent after done", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    const run = stubWorkersAiMcq(env);

    const { result } = await enqueueAndProcess(env);
    expect(result).toBe("done");
    const callsAfterFirst = run.mock.calls.length;
    const again = await processLatestCardRegen(env);
    expect(again).toBe("done");
    expect(run.mock.calls.length).toBe(callsAfterFirst);
    expect(env.getUsageEvents().filter((e) => e.kind === "regen")).toHaveLength(
      1,
    );
  });

  it("fails stale running card regen ops", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    const staleCreated = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 60_000,
    ).toISOString();
    env.seedCardRegenOp({
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
    const op = env.getCardRegenOps().find((o) => o.id === "op-stale")!;
    expect(op.status).toBe("failed");
    expect(op.error).toBe(STALE_CARD_REGEN_FAIL_ERROR);
  });
});
