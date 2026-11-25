import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
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
});
