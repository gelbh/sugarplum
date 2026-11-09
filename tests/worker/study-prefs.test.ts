import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

describe("GET/PUT /api/settings/study", () => {
  function seedUser(env: ReturnType<typeof createTestEnv>) {
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
  }

  it("rejects unauthenticated requests", async () => {
    const env = createTestEnv();
    seedUser(env);

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
    const env = createTestEnv();
    seedUser(env);

    const getRes = await app.request(
      "/api/settings/study",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({
      introBudget: 20,
      reviewBudget: 200,
      rFloor: 0.8,
      desiredRetention: 0.9,
      enableFuzz: true,
    });
  });

  it("PUT clamps and round-trips via GET", async () => {
    const env = createTestEnv();
    seedUser(env);

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
      rFloor: 0.5,
      desiredRetention: 0.9,
      enableFuzz: true,
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
      rFloor: 0.5,
      desiredRetention: 0.9,
      enableFuzz: true,
    });
  });

  it("PUT clamps desiredRetention and enableFuzz", async () => {
    const env = createTestEnv();
    seedUser(env);

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
      rFloor: 0.8,
      desiredRetention: 0.7,
      enableFuzz: false,
    });
  });

  it("PUT clamps high intro and low review; high rFloor", async () => {
    const env = createTestEnv();
    seedUser(env);

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
      rFloor: 0.99,
      desiredRetention: 0.9,
      enableFuzz: true,
    });
  });
});
