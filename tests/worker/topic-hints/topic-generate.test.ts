import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedPasteOwner(env: Bindings) {
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
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("POST /api/decks/:id/topic-generate", () => {
  async function seedDeckWithMaterialAndCards(env: Bindings) {
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-a",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-a.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedGenerationJob(env, {
      id: "job-old",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "c-keep-1",
      deck_id: "deck-a",
      job_id: "job-old",
      type: "qa",
      front_json: JSON.stringify("Keep 1?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    await seedCard(env, {
      id: "c-keep-2",
      deck_id: "deck-a",
      job_id: "job-old",
      type: "qa",
      front_json: JSON.stringify("Keep 2?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:07:00.000Z",
      updated_at: "2026-01-01T01:07:00.000Z",
    });
  }

  it("queues a new job with topic hint and leaves existing cards intact", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedDeckWithMaterialAndCards(env);
    const cardsBefore = (await getCards(env)).length;

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ topic: "cranial nerves" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();
    expect(body.jobId).not.toBe("job-old");

    expect((await getCards(env))).toHaveLength(cardsBefore);
    expect(
      (await getCards(env))
        .map((c) => c.id)
        .sort(),
    ).toEqual(["c-keep-1", "c-keep-2"]);

    const jobs = (await getGenerationJobs(env));
    expect(jobs).toHaveLength(2);
    const created = jobs.find((j) => j.id === body.jobId);
    expect(created).toMatchObject({
      material_id: "mat-a",
      status: "queued",
    });
    expect(JSON.parse(created?.topic_hints_json as string)).toEqual([
      "cranial nerves",
    ]);

    const queued = getQueueMessages() as {
      jobId: string;
      materialId: string;
      deckId: string;
    }[];
    expect(queued.some((m) => m.jobId === body.jobId)).toBe(true);
  });

  it("returns 400 for an empty topic", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedDeckWithMaterialAndCards(env);

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ topic: "   " }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getGenerationJobs(env))).toHaveLength(1);
  });

  it("returns 404 for another user's deck", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedDeckWithMaterialAndCards(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ topic: "cranial nerves" }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect((await getCards(env))).toHaveLength(2);
  });

  it("returns 422 when the deck has no paste/pdf material", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ topic: "cranial nerves" }),
      },
      env,
    );

    expect(res.status).toBe(422);
    expect((await getGenerationJobs(env))).toHaveLength(0);
  });

  it("rejects free-path image generate with DIY occlusion guidance", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img.png",
      filename: "diagram.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          topic: "labels",
          materialId: "mat-img",
        }),
      },
      env,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; message?: string };
    const msg = body.error ?? body.message ?? JSON.stringify(body);
    expect(msg).toMatch(/Occlusion|suggested automatically|API key/i);
    expect((await getGenerationJobs(env))).toHaveLength(0);
  });
});
