import { env as cfEnv } from "cloudflare:workers";
import {
  getExportJobs,
  installQueueRecorders,
  resetTestDb,
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
});
