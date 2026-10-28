import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

const user = {
  id: "user-a",
  email: "a@example.com",
  password_hash: null,
  oauth_subject: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function setup() {
  const env = createTestEnv();
  env.seedUser(user);
  env.seedSubject({
    id: "subject-a",
    user_id: user.id,
    title: "Anatomy",
    created_at: user.created_at,
  });
  env.seedDeck({
    id: "deck-a",
    user_id: user.id,
    title: "Bones",
    subject_hint: null,
    subject_id: "subject-a",
    created_at: user.created_at,
  });
  env.seedSession("sess-a", user.id);
  return env;
}

function headers() {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    origin: "http://localhost",
    "content-type": "application/json",
  };
}

function seedCard(
  env: ReturnType<typeof createTestEnv>,
  overrides: Partial<Parameters<typeof env.seedCard>[0]> = {},
) {
  env.seedCard({
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
    const env = createTestEnv();
    const response = await app.request(
      "/api/exports",
      {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ type: "deck", deckId: "deck-a" }),
      },
      env,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when reading another user's export", async () => {
    const env = setup();
    const response = await app.request(
      "/api/exports/not-owned",
      { headers: headers() },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("rejects a deck with no accepted cards", async () => {
    const env = setup();
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
    expect(await response.json()).toEqual({
      message: "No accepted cards to export",
    });
  });

  it("marks a missing deck export as failed", async () => {
    const env = setup();
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
    expect(env.getExportJobs()).toHaveLength(1);
    expect(env.getExportJobs()[0]?.status).toBe("failed");
  });

  it("builds a ready export and serves APKG bytes", async () => {
    const env = setup();
    seedCard(env);
    env.seedSchedule({
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
});
