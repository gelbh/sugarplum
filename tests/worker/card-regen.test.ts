import { describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  capRegenSourceText,
} from "../../worker/generation/card-regen";
import { CHUNK_CHAR_LIMIT } from "../../worker/generation/pipeline";
import {
  FREE_GEN_DAILY_CAP,
  consumeFreeGenSlot,
} from "../../worker/generation/quota";
import { WORKERS_AI_MODEL } from "../../worker/generation/workers-ai";
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
    provenance_json: JSON.stringify({ pages: [1], excerpt: "left" }),
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
    provenance_json: JSON.stringify({ pages: [1], excerpt: "middle" }),
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
    provenance_json: JSON.stringify({ pages: [1], excerpt: "right" }),
    status: "draft",
    created_at: "2026-01-01T01:08:00.000Z",
    updated_at: "2026-01-01T01:08:00.000Z",
  });
}

function stubWorkersAiMcq(env: ReturnType<typeof createTestEnv>) {
  const mcqJson = JSON.stringify({
    cards: [
      {
        type: "mcq",
        front: "Which organelle produces ATP?",
        back: "Mitochondria",
        options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
        provenance: {
          pages: [1],
          excerpt: "Mitochondria produce ATP",
        },
      },
    ],
  });
  const run = vi.fn(async (_model: string) => {
    expect(_model).toBe(WORKERS_AI_MODEL);
    return {
      id: "chatcmpl-regen",
      object: "chat.completion",
      created: 0,
      model: WORKERS_AI_MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: mcqJson,
            refusal: null,
          },
          finish_reason: "stop" as const,
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
      },
    };
  });
  env.AI = { run } as unknown as Ai;
  return run;
}

describe("POST /api/cards/:id/regen", () => {
  it("regenerates middle draft as mcq and leaves sibling fronts intact", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2(
      "materials/deck-a/mat-a.txt",
      "Mitochondria produce ATP in eukaryotic cells.",
    );
    const run = stubWorkersAiMcq(env);

    const res = await app.request(
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
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      type: string;
      front: string;
      back: string;
      options?: string[];
      status: string;
      job_id: string | null;
    };
    expect(body).toMatchObject({
      id: "c-mid",
      type: "mcq",
      status: "draft",
      job_id: "job-a",
      front: "Which organelle produces ATP?",
      back: "Mitochondria",
    });
    expect(body.options).toEqual([
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

    const regenEvents = env
      .getUsageEvents()
      .filter((e) => e.kind === "regen");
    expect(regenEvents).toHaveLength(1);
    expect(regenEvents[0]).toMatchObject({
      user_id: "user-a",
      job_id: null,
      kind: "regen",
      path: "free",
      provider: "workers-ai",
      tokens_prompt: 100,
      tokens_completion: 40,
      tokens_total: 140,
    });
  });

  it("returns 429 when free-gen daily cap is exhausted on workers-ai", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    env.seedR2("materials/deck-a/mat-a.txt", "Mitochondria produce ATP.");
    stubWorkersAiMcq(env);
    for (let i = 0; i < FREE_GEN_DAILY_CAP; i++) {
      await consumeFreeGenSlot(env, "user-a");
    }

    const res = await app.request(
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
    expect(res.status).toBe(429);
    expect(env.getUsageEvents().filter((e) => e.kind === "regen")).toHaveLength(
      0,
    );
    expect(JSON.parse(env.getCards().find((c) => c.id === "c-mid")!.front_json)).toBe(
      "Middle front?",
    );
  });

  it("caps oversized material text before the LLM prompt", async () => {
    const env = createTestEnv();
    seedOwner(env);
    seedThreeDrafts(env);
    const huge = `${"Mitochondria produce ATP. ".repeat(400)}${"X".repeat(CHUNK_CHAR_LIMIT)}`;
    expect(huge.length).toBeGreaterThan(CHUNK_CHAR_LIMIT);
    env.seedR2("materials/deck-a/mat-a.txt", huge);
    const run = stubWorkersAiMcq(env);

    const res = await app.request(
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
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    const body = run.mock.calls[0]![1] as {
      messages?: { role: string; content: string }[];
    };
    const userMsg = body.messages?.find((m) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain("--- MATERIAL ---");
    const material = userMsg.split("--- MATERIAL ---")[1]?.split("--- END ---")[0] ?? "";
    expect(material.trim().length).toBeLessThanOrEqual(CHUNK_CHAR_LIMIT);
    expect(material).not.toContain("XXXX");
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
      provenance_json: JSON.stringify({ pages: [1], excerpt: "mito" }),
      status: "draft",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    env.seedR2(
      "materials/deck-a/mat-a.txt",
      "Mitochondria produce ATP in eukaryotic cells.",
    );
    stubWorkersAiMcq(env);

    const res = await app.request(
      "/api/cards/c-vis/regen",
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
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      media_r2_keys?: string[];
    };
    expect(body.type).toBe("mcq");
    expect(body.media_r2_keys ?? []).toEqual([]);
    expect(env.getCards().find((c) => c.id === "c-vis")!.media_r2_keys_json).toBe(
      null,
    );
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
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
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

    const res = await app.request(
      "/api/cards/c-acc/regen",
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
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; type: string };
    expect(body.status).toBe("accepted");
    expect(body.type).toBe("mcq");
    expect(env.getSchedules()).toHaveLength(1);
    expect(env.getSchedules()[0]!.due).toBe(due);
    expect(env.getSchedules()[0]!.reps).toBe(2);
  });
});
