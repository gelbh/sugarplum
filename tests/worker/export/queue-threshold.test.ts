import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getExportJobs,
  getExportQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedCard,
  seedDeck,
  seedSession,
  seedSubject,
  seedUser,
  withTestBindings,
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
