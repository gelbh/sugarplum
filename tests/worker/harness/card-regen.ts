import { expect, vi } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { processCardRegenOp } from "../../../worker/generation/card-regen-op";
import type { CardRegenQueueMessage } from "../../../worker/generation/enqueue";
import { WORKERS_AI_CLAIM_CARD_MODEL } from "../../../worker/generation/claim-card-fallback";
import { WORKERS_AI_MODEL } from "../../../worker/generation/workers-ai";
import { getCardRegenQueueMessages } from "./recorders";
import {
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedUser,
} from "./seed";
import type { Bindings } from "./types";

export async function seedCardRegenOwner(env: Bindings): Promise<void> {
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
  await seedMaterial(env, {
    id: "mat-a",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-a.txt",
    filename: "notes.txt",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

export async function seedThreeDrafts(env: Bindings): Promise<void> {
  await seedGenerationJob(env, {
    id: "job-a",
    material_id: "mat-a",
    status: "needs_review",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-01-01T01:00:00.000Z",
    finished_at: "2026-01-01T01:05:00.000Z",
  });
  await seedCard(env, {
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
  await seedCard(env, {
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
  await seedCard(env, {
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

export const VALID_CLAIMS = JSON.stringify({
  claims: [
    {
      subject: "Mitochondria",
      predicate: "produce ATP",
      object: "ATP",
      source_span: "Mitochondria produce ATP",
    },
  ],
});

export const VALID_MCQ = JSON.stringify({
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
export const COMPOUND_MCQ = JSON.stringify({
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

export function stubWorkersAiSequence(env: Bindings, contents: string[]) {
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
export function stubWorkersAiMcq(env: Bindings) {
  return stubWorkersAiSequence(env, [VALID_CLAIMS, VALID_MCQ]);
}

export function regenRequest(
  env: Bindings,
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

export function latestCardRegenMessage(env: Bindings): CardRegenQueueMessage {
  const msgs = getCardRegenQueueMessages() as CardRegenQueueMessage[];
  const last = msgs[msgs.length - 1];
  if (!last) throw new Error("expected cardRegen queue message");
  return last;
}

export async function processLatestCardRegen(env: Bindings) {
  return processCardRegenOp(env, latestCardRegenMessage(env));
}

export async function getRegenOp(
  env: Bindings,
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

export async function enqueueAndProcess(
  env: Bindings,
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
