import { describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
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
