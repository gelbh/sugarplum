import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  CARD_REGEN_QUEUE_MAX_RETRIES,
  CARD_REGEN_QUEUE_RETRY_DELAY_SEC,
} from "../../worker/generation/card-regen-op";
import {
  handleCardRegenQueue,
  handleGenerateQueue,
} from "../../worker/generation/consumer";
import type { CardRegenQueueMessage } from "../../worker/generation/enqueue";
import { RUNNING_JOB_STALE_MS } from "../../worker/generation/progress";
import {
  WORKERS_AI_CLAIM_CARD_MODEL,
  WORKERS_AI_MODEL,
} from "../../worker/generation/workers-ai";
import { createTestEnv } from "./test-env";

function mockBatch(body: CardRegenQueueMessage) {
  const ack = vi.fn();
  const retry = vi.fn();
  return {
    ack,
    retry,
    batch: {
      queue: "sugarplum-card-regen",
      messages: [
        {
          id: "m-regen",
          timestamp: new Date(),
          body,
          attempts: 1,
          ack,
          retry,
        },
      ],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
      metadata: { metrics: {} as never },
    } as MessageBatch<CardRegenQueueMessage>,
  };
}

describe("handleCardRegenQueue", () => {
  it("omits max_concurrency and syncs retry budget in wrangler", () => {
    const wrangler = readFileSync(
      resolve(import.meta.dirname, "../../wrangler.jsonc"),
      "utf8",
    );
    expect(wrangler).toContain(`"max_retries": ${CARD_REGEN_QUEUE_MAX_RETRIES}`);
    expect(wrangler).toContain(
      `"retry_delay": ${CARD_REGEN_QUEUE_RETRY_DELAY_SEC}`,
    );
    const consumer = wrangler.match(
      new RegExp(
        `\\{\\s*"queue": "sugarplum-card-regen",[\\s\\S]*?"retry_delay": ${CARD_REGEN_QUEUE_RETRY_DELAY_SEC}\\s*,?\\s*\\}`,
      ),
    )?.[0];
    expect(consumer).toBeTruthy();
    expect(consumer).not.toMatch(/"max_concurrency"/);
    expect(
      CARD_REGEN_QUEUE_MAX_RETRIES * CARD_REGEN_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
  });

  it("handleGenerateQueue still drains legacy cardRegen on GENERATE_QUEUE", async () => {
    const env = createTestEnv();
    const ack = vi.fn();
    const retry = vi.fn();
    await handleGenerateQueue(
      {
        queue: "sugarplum-generate",
        messages: [
          {
            id: "m-legacy",
            timestamp: new Date(),
            body: {
              kind: "cardRegen",
              opId: "missing-op",
              cardId: "c-mid",
              userId: "u-a",
              type: "mcq",
            } as unknown as never,
            attempts: 1,
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
    expect(retry).toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(env.getWorkflowCreates()).toHaveLength(0);
  });

  it("retries when process throws", async () => {
    const env = createTestEnv();
    const { ack, retry, batch } = mockBatch({
      kind: "cardRegen",
      opId: "missing-op",
      cardId: "c-mid",
      userId: "u-a",
      type: "mcq",
    });
    await handleCardRegenQueue(batch, env);
    expect(retry).toHaveBeenCalledWith({
      delaySeconds: CARD_REGEN_QUEUE_RETRY_DELAY_SEC,
    });
    expect(ack).not.toHaveBeenCalled();
  });

  it("drains CARD_REGEN_QUEUE messages to done", async () => {
    const env = createTestEnv();
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
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");

    const claims = JSON.stringify({
      claims: [
        {
          subject: "Mitochondria",
          predicate: "produce ATP",
          object: "ATP",
          source_span: "Mitochondria produce ATP",
        },
      ],
    });
    const mcq = JSON.stringify({
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
    let i = 0;
    const contents = [claims, mcq];
    env.AI = {
      run: vi.fn(async (model: string) => {
        expect([WORKERS_AI_CLAIM_CARD_MODEL, WORKERS_AI_MODEL]).toContain(
          model,
        );
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
          usage: {
            prompt_tokens: 100,
            completion_tokens: 40,
            total_tokens: 140,
          },
        };
      }),
    } as unknown as Ai;

    const post = await app.request(
      "/api/cards/c-mid/regen",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ type: "mcq" }),
      },
      env,
    );
    expect(post.status).toBe(202);
    const msgs = env.getCardRegenQueueMessages() as CardRegenQueueMessage[];
    expect(msgs).toHaveLength(1);
    expect(env.getQueueMessages()).toHaveLength(0);

    const { ack, retry, batch } = mockBatch(msgs[0]!);
    await handleCardRegenQueue(batch, env);
    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(env.getCardRegenOps().find((o) => o.id === msgs[0]!.opId)?.status).toBe(
      "done",
    );
  });
});
