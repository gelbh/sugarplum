import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getExportJobs,
  getExportQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedExportJob,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
  withTestBindings,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const user = {
  id: "user-a",
  email: "a@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

async function setup() {
  const env = installQueueRecorders(cfEnv);
  await seedUser(env, user);
  await seedSubject(env, {
    id: "subject-a",
    user_id: user.id,
    title: "Anatomy",
    created_at: user.created_at,
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: user.id,
    title: "Bones",
    subject_hint: null,
    subject_id: "subject-a",
    created_at: user.created_at,
  });
  await seedSession(env, "sess-a", user.id);
  return env;
}

function headers() {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    origin: "http://localhost",
    "content-type": "application/json",
  };
}

async function seedCardFixture(
  env: Bindings,
  overrides: Partial<import("./harness").CardRow> = {},
) {
  await seedCard(env, {
    id: "card-a",
    deck_id: "deck-a",
    job_id: null,
    type: "qa",
    front_json: JSON.stringify("What is the femur?"),
    back_json: JSON.stringify("The thigh bone"),
    media_r2_keys_json: null,
    provenance_json: null,
    status: "accepted",
    created_at: user.created_at,
    updated_at: user.created_at,
    ...overrides,
  });
}

describe("export routes", () => {
  it("requires authentication", async () => {
    const env = installQueueRecorders(cfEnv);
    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when reading another user's export", async () => {
    const env = await setup();
    const response = await app.request(
      "/api/exports/not-owned",
      { headers: headers() },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("rejects a deck with no accepted cards", async () => {
    const env = await setup();
    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(
      /application\/problem\+json/i,
    );
    expect(await response.json()).toEqual({
      type: "https://sugarplum.gelbhart.dev/problems/export-business",
      title: "No accepted cards to export",
      status: 400,
      detail: "No accepted cards to export",
      warnings: { missingMedia: 0, skippedCards: 0 },
    });
  });

  it("exports an accepted occlusion deck with media", async () => {
    const env = await setup();
    const imageKey = "materials/deck-a/fig.png";
    await env.MATERIALS.put(imageKey, new Uint8Array([137, 80, 78, 71]));
    await seedCardFixture(env, {
      id: "card-occlusion",
      type: "occlusion",
      front_json: JSON.stringify({
        image_key: imageKey,
        regions: [
          { id: "r1", x: 0, y: 0, w: 0.2, h: 0.2, label: "A" },
          { id: "r2", x: 0.5, y: 0.5, w: 0.1, h: 0.1, label: "B" },
        ],
        mode: "hide_one",
      }),
      back_json: JSON.stringify({ answer: "A" }),
      media_r2_keys_json: JSON.stringify([imageKey]),
    });
    const create = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );

    expect(create.status).toBe(201);
    const body = (await create.json()) as {
      id: string;
      status: string;
      warnings: { missingMedia: number; skippedCards: number };
      downloadPath: string;
    };
    expect(body).toMatchObject({
      status: "ready",
      warnings: { missingMedia: 0, skippedCards: 0 },
      downloadPath: `/api/exports/${body.id}/download`,
    });

    const download = await app.request(body.downloadPath, {
      headers: headers(),
    }, env);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("application/");
    const bytes = new Uint8Array(await download.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it("rejects invalid occlusion-only decks as all-skipped", async () => {
    const env = await setup();
    await seedCardFixture(env, {
      id: "card-occlusion-bad",
      type: "occlusion",
      front_json: JSON.stringify({
        image_key: "materials/deck-a/fig.png",
        mode: "hide_one",
        regions: [],
      }),
      back_json: JSON.stringify({ answer: "A" }),
    });
    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(
      /application\/problem\+json/i,
    );
    expect(await response.json()).toEqual({
      type: "https://sugarplum.gelbhart.dev/problems/export-business",
      title: "No exportable cards (1 skipped)",
      status: 400,
      detail: "No exportable cards (1 skipped)",
      warnings: { missingMedia: 0, skippedCards: 1 },
    });
  });

  it("counts skipped invalid occlusion beside exportable qa", async () => {
    const env = await setup();
    await seedCardFixture(env, {
      id: "card-qa",
      type: "qa",
      front_json: JSON.stringify("Q"),
      back_json: JSON.stringify("A"),
    });
    await seedCardFixture(env, {
      id: "card-occlusion-bad",
      type: "occlusion",
      front_json: JSON.stringify({
        image_key: "materials/deck-a/fig.png",
        mode: "hide_one",
        regions: [],
      }),
      back_json: JSON.stringify({ answer: "A" }),
    });
    const create = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const body = (await create.json()) as {
      warnings: { missingMedia: number; skippedCards: number };
    };
    expect(body.warnings).toEqual({ missingMedia: 0, skippedCards: 1 });
  });

  it("marks a missing deck export as failed", async () => {
    const env = await setup();
    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "missing-deck" }),
      },
      env,
    );

    expect(response.status).toBe(404);
    expect((await getExportJobs(env))).toHaveLength(1);
    expect((await getExportJobs(env))[0]?.status).toBe("failed");
  });

  it("builds a ready export and serves APKG bytes", async () => {
    const env = await setup();
    await seedCardFixture(env);
    await seedSchedule(env, {
      card_id: "card-a",
      due: "2026-01-02T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });

    const create = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );

    expect(create.status).toBe(201);
    const body = (await create.json()) as {
      id: string;
      status: string;
      warnings: { missingMedia: number; skippedCards: number };
      downloadPath: string;
    };
    expect(body).toMatchObject({
      status: "ready",
      warnings: { missingMedia: 0, skippedCards: 0 },
      downloadPath: `/api/exports/${body.id}/download`,
    });

    const metadata = await app.request(
      `/api/exports/${body.id}`,
      { headers: headers() },
      env,
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      id: body.id,
      status: "ready",
    });

    const download = await app.request(
      `/api/exports/${body.id}/download`,
      { headers: headers() },
      env,
    );
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer()).slice(0, 2)).toEqual(
      new Uint8Array([0x50, 0x4b]),
    );
  });

  it("returns 410 when downloading an expired export", async () => {
    const env = await setup();
    await seedCardFixture(env);
    const create = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const body = (await create.json()) as { id: string };
    const job = (await getExportJobs(env)).find((row) => row.id === body.id);
    expect(job).toBeTruthy();
    await seedExportJob(env, {
      ...job!,
      expires_at: "2020-01-01T00:00:00.000Z",
    });

    const download = await app.request(
      `/api/exports/${body.id}/download`,
      { headers: headers() },
      env,
    );
    expect(download.status).toBe(410);
  });

  it("exports a subject of owned decks", async () => {
    const env = await setup();
    await seedDeck(env, {
      id: "deck-b",
      user_id: user.id,
      title: "Muscles",
      subject_hint: null,
      subject_id: "subject-a",
      created_at: "2026-01-01T00:00:01.000Z",
    });
    await seedCardFixture(env);
    await seedCardFixture(env, {
      id: "card-b",
      deck_id: "deck-b",
      front_json: JSON.stringify("Biceps?"),
      back_json: JSON.stringify("Arm flexor"),
    });

    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type: "subject", subjectId: "subject-a" }),
      },
      env,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      status: "ready",
      warnings: { missingMedia: 0, skippedCards: 0 },
    });
  });

  it("exports a selection union of subject and deck ids", async () => {
    const env = await setup();
    await seedDeck(env, {
      id: "deck-solo",
      user_id: user.id,
      title: "Loose",
      subject_hint: null,
      subject_id: null,
      created_at: user.created_at,
    });
    await seedCardFixture(env);
    await seedCardFixture(env, {
      id: "card-solo",
      deck_id: "deck-solo",
      front_json: JSON.stringify("Solo?"),
      back_json: JSON.stringify("Yes"),
    });

    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          type: "selection",
          subjectIds: ["subject-a"],
          deckIds: ["deck-solo"],
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "ready" });
  });

  it("returns 400 when selection resolves to no owned decks", async () => {
    const env = await setup();
    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          type: "selection",
          subjectIds: [],
          deckIds: [],
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(
      /application\/problem\+json/i,
    );
    expect(await response.json()).toMatchObject({
      type: "https://sugarplum.gelbhart.dev/problems/export-business",
      title: "No decks to export",
      status: 400,
      detail: "No decks to export",
      warnings: { missingMedia: 0, skippedCards: 0 },
    });
    expect((await getExportJobs(env))[0]?.status).toBe("failed");
  });

  it("omits foreign selection ids and 400s when none remain", async () => {
    const env = await setup();
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: user.created_at,
    });
    await seedSubject(env, {
      id: "subject-b",
      user_id: "user-b",
      title: "Foreign",
      created_at: user.created_at,
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Other",
      subject_hint: null,
      subject_id: "subject-b",
      created_at: user.created_at,
    });

    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          type: "selection",
          subjectIds: ["subject-b"],
          deckIds: ["deck-b"],
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(
      /application\/problem\+json/i,
    );
    expect(await response.json()).toMatchObject({
      type: "https://sugarplum.gelbhart.dev/problems/export-business",
      title: "No decks to export",
      status: 400,
      detail: "No decks to export",
      warnings: { missingMedia: 0, skippedCards: 0 },
    });
  });

  it("enqueues over-threshold selection and returns 202 queued", async () => {
    const env = await setup();
    const deckIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const id = `deck-bulk-${i}`;
      deckIds.push(id);
      await seedDeck(env, {
        id,
        user_id: user.id,
        title: `Bulk ${i}`,
        subject_hint: null,
        subject_id: "subject-a",
        created_at: user.created_at,
      });
      await seedCardFixture(env, {
        id: `card-bulk-${i}`,
        deck_id: id,
        job_id: null,
        type: "qa",
        front_json: JSON.stringify(`Q${i}`),
        back_json: JSON.stringify(`A${i}`),
        media_r2_keys_json: null,
        provenance_json: null,
        status: "accepted",
        created_at: user.created_at,
        updated_at: user.created_at,
      });
    }

    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          type: "selection",
          subjectIds: [],
          deckIds,
        }),
      },
      env,
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      id: string;
      status: string;
      downloadPath: string | null;
    };
    expect(body).toMatchObject({
      status: "queued",
      downloadPath: null,
    });
    expect((await getExportJobs(env))[0]?.status).toBe("queued");
    expect(getExportQueueMessages()).toEqual([{ exportId: body.id }]);
  });

  it("returns 503 when over threshold and EXPORT_QUEUE is unbound", async () => {
    const env = installQueueRecorders(withTestBindings(cfEnv, { exportQueue: false }));
    await seedUser(env, user);
    await seedSubject(env, {
      id: "subject-a",
      user_id: user.id,
      title: "Anatomy",
      created_at: user.created_at,
    });
    await seedSession(env, "sess-a", user.id);
    const deckIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const id = `deck-bulk-${i}`;
      deckIds.push(id);
      await seedDeck(env, {
        id,
        user_id: user.id,
        title: `Bulk ${i}`,
        subject_hint: null,
        subject_id: "subject-a",
        created_at: user.created_at,
      });
      await seedCardFixture(env, {
        id: `card-bulk-${i}`,
        deck_id: id,
        job_id: null,
        type: "qa",
        front_json: JSON.stringify(`Q${i}`),
        back_json: JSON.stringify(`A${i}`),
        media_r2_keys_json: null,
        provenance_json: null,
        status: "accepted",
        created_at: user.created_at,
        updated_at: user.created_at,
      });
    }

    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          type: "selection",
          subjectIds: [],
          deckIds,
        }),
      },
      env,
    );

    expect(response.status).toBe(503);
    expect((await getExportJobs(env))[0]?.status).toBe("failed");
  });

  it("marks queued job failed with 503 when EXPORT_QUEUE.send throws", async () => {
    const env = await setup();
    const deckIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const id = `deck-send-fail-${i}`;
      deckIds.push(id);
      await seedDeck(env, {
        id,
        user_id: user.id,
        title: `Bulk ${i}`,
        subject_hint: null,
        subject_id: "subject-a",
        created_at: user.created_at,
      });
      await seedCardFixture(env, {
        id: `card-send-fail-${i}`,
        deck_id: id,
        job_id: null,
        type: "qa",
        front_json: JSON.stringify(`Q${i}`),
        back_json: JSON.stringify(`A${i}`),
        media_r2_keys_json: null,
        provenance_json: null,
        status: "accepted",
        created_at: user.created_at,
        updated_at: user.created_at,
      });
    }
    env.EXPORT_QUEUE = {
      send: async () => {
        throw new Error("queue unavailable");
      },
    } as unknown as Queue;

    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          type: "selection",
          subjectIds: [],
          deckIds,
        }),
      },
      env,
    );

    expect(response.status).toBe(503);
    expect((await getExportJobs(env))[0]?.status).toBe("failed");
    expect((await getExportJobs(env))[0]?.error).toMatch(/unavailable/i);
    expect(getExportQueueMessages()).toEqual([]);
  });
});
