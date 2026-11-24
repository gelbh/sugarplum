import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { clampStudyPrefs } from "../../src/study/policyPrefs";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("clampStudyPrefs rFloor alias", () => {
  it("mirrors rFloor to clamped desiredRetention", () => {
    expect(
      clampStudyPrefs({ desiredRetention: 0.85, rFloor: 0.5 }).rFloor,
    ).toBe(0.85);
    expect(clampStudyPrefs({ desiredRetention: 0.5 }).rFloor).toBe(0.7);
    expect(clampStudyPrefs({ rFloor: 0.1 }).rFloor).toBe(0.9);
  });
});

describe("GET/PUT /api/settings/study", () => {
  async function seedUserFixture(env: Bindings) {
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
  }

  it("rejects unauthenticated requests", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

    const getRes = await app.request("/api/settings/study", {}, env);
    expect(getRes.status).toBe(401);

    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          introBudget: 10,
          reviewBudget: 100,
          rFloor: 0.85,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(401);
  });

  it("GET returns defaults when no prefs row exists", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

    const getRes = await app.request(
      "/api/settings/study",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({
      introBudget: 20,
      reviewBudget: 200,
      rFloor: 0.9,
      desiredRetention: 0.9,
      enableFuzz: true,
      enableLoadBalance: true,
      easyDays: [
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
      ],
    });
  });

  it("PUT clamps budgets and mirrors rFloor to desiredRetention", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          introBudget: 0,
          reviewBudget: 9999,
          rFloor: 0.1,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({
      introBudget: 1,
      reviewBudget: 2000,
      rFloor: 0.9,
      desiredRetention: 0.9,
      enableFuzz: true,
      enableLoadBalance: true,
      easyDays: [
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
      ],
    });

    const getRes = await app.request(
      "/api/settings/study",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({
      introBudget: 1,
      reviewBudget: 2000,
      rFloor: 0.9,
      desiredRetention: 0.9,
      enableFuzz: true,
      enableLoadBalance: true,
      easyDays: [
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
      ],
    });
  });

  it("PUT clamps desiredRetention and mirrors rFloor", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          introBudget: 10,
          reviewBudget: 100,
          rFloor: 0.8,
          desiredRetention: 0.5,
          enableFuzz: false,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({
      introBudget: 10,
      reviewBudget: 100,
      rFloor: 0.7,
      desiredRetention: 0.7,
      enableFuzz: false,
      enableLoadBalance: true,
      easyDays: [
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
      ],
    });
  });

  it("PUT persists enableLoadBalance and easyDays", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

    const easyDays = [
      "minimum",
      "reduced",
      "normal",
      "normal",
      "normal",
      "normal",
      "minimum",
    ];
    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          introBudget: 20,
          reviewBudget: 200,
          desiredRetention: 0.9,
          enableFuzz: true,
          enableLoadBalance: false,
          easyDays,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      enableLoadBalance: false,
      easyDays,
    });
  });

  it("PUT clamps high intro and low review; ignores high rFloor input", async () => {
    const env = cfEnv;
    await seedUserFixture(env);

    const putRes = await app.request(
      "/api/settings/study",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          introBudget: 500,
          reviewBudget: 0,
          rFloor: 1.5,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({
      introBudget: 200,
      reviewBudget: 1,
      rFloor: 0.9,
      desiredRetention: 0.9,
      enableFuzz: true,
      enableLoadBalance: true,
      easyDays: [
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
        "normal",
      ],
    });
  });
});
