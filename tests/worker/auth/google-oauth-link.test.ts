import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb, seedSession, seedUser } from "../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../../worker/index";
import { OAUTH_KV_PREFIX, googleOauthSubject } from "../../../worker/auth/google";
import { OAUTH_CTX_COOKIE } from "../../../worker/auth/oauth-replay";
import { hashPassword } from "../../../worker/auth/password";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { stubGoogleTokenAndProfile } from "./oauth-stubs";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google OAuth link", () => {
  it("link start returns 401 without session", async () => {
    const env = cfEnv;
    const res = await app.request(
      "/api/auth/google/start?intent=link",
      { method: "GET" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("link start redirects when authenticated", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-link",
      email: "pw@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-link", "user-link");
    const res = await app.request(
      "/api/auth/google/start?intent=link",
      {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE}=sess-link` },
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(
      /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
    );
  });

  it("link callback sets oauth_subject when session and email match", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-pw",
      email: "pwlink@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-pw", "user-pw");
    const state = "state-settings-link";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({
        codeVerifier: "verifier",
        createdAt: Date.now(),
        intent: "link",
        userId: "user-pw",
      }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-settings",
      email: "pwlink@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      {
        method: "GET",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-pw; ${OAUTH_CTX_COOKIE}=${state}`,
        },
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/settings?linked=1",
    );

    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=sess-pw` } },
      env,
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as {
      email: string;
      google_linked: boolean;
    };
    expect(body.email).toBe("pwlink@example.com");
    expect(body.google_linked).toBe(true);
  });

  it("link callback rejects Google email mismatch", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-mm",
      email: "account@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-mm", "user-mm");
    const state = "state-mismatch";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({
        codeVerifier: "verifier",
        createdAt: Date.now(),
        intent: "link",
        userId: "user-mm",
      }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-mm",
      email: "other@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      {
        method: "GET",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-mm; ${OAUTH_CTX_COOKIE}=${state}`,
        },
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/settings?error=oauth_email_mismatch",
    );
  });

  it("link callback rejects when Google subject belongs to another user", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-taken",
      email: "taken-g@example.com",
      password_hash: null,
      oauth_subject: googleOauthSubject("shared-sub"),
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "user-want",
      email: "want@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-want", "user-want");
    const state = "state-subject-taken";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({
        codeVerifier: "verifier",
        createdAt: Date.now(),
        intent: "link",
        userId: "user-want",
      }),
    );
    stubGoogleTokenAndProfile({
      sub: "shared-sub",
      email: "want@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      {
        method: "GET",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-want; ${OAUTH_CTX_COOKIE}=${state}`,
        },
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/settings?error=oauth_conflict",
    );
  });

  it("me reports google_linked false for password-only users", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-plain",
      email: "plain@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-plain", "user-plain");
    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=sess-plain` } },
      env,
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as { google_linked: boolean };
    expect(body.google_linked).toBe(false);
  });
});