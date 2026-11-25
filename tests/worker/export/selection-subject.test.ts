import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getExportJobs,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
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
});
