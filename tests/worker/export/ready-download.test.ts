import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getExportJobs,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedExportJob,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

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
  overrides: Partial<import("../harness").CardRow> = {},
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
});
