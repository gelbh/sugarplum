import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import {
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  OAUTH_KV_PREFIX,
  googleOauthSubject,
} from "../../worker/auth/google";
import {
  hashPassword,
  isPasswordLongEnough,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "../../worker/auth/password";
import {
  isSessionActive,
  parseSessionRecord,
  SESSION_COOKIE,
  sessionCookieSecure,
} from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubGoogleTokenAndProfile(profile: {
  sub: string;
  email: string;
  email_verified?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === GOOGLE_TOKEN_URL) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ access_token: "atok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === GOOGLE_USERINFO_URL) {
        return new Response(
          JSON.stringify({
            sub: profile.sub,
            email: profile.email,
            email_verified: profile.email_verified ?? true,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

describe("auth register validation", () => {
  it("rejects short password", async () => {
    const env = createTestEnv();
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.co", password: "short" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing email", async () => {
    const env = createTestEnv();
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "long-enough-password",
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("password helpers", () => {
  it(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isPasswordLongEnough("short")).toBe(false);
    expect(isPasswordLongEnough("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it("hashes and verifies with PBKDF2", async () => {
    const password = "correct-horse-battery";
    const hash = await hashPassword(password);
    expect(hash.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password!!", hash)).toBe(false);
  });
});

describe("session helpers", () => {
  it("parses and validates session records", () => {
    const future = Date.now() + 60_000;
    const raw = JSON.stringify({ userId: "u1", expiresAt: future });
    const record = parseSessionRecord(raw);
    expect(record).toEqual({ userId: "u1", expiresAt: future });
    expect(isSessionActive(record!)).toBe(true);
    expect(isSessionActive({ userId: "u1", expiresAt: Date.now() - 1 })).toBe(
      false,
    );
    expect(parseSessionRecord("not-json")).toBeNull();
  });

  it("exports the sp_session cookie name", () => {
    expect(SESSION_COOKIE).toBe("sp_session");
  });

  it("gates Secure on https only so localhost http works", () => {
    expect(sessionCookieSecure("http://localhost:8787/api/auth/login")).toBe(
      false,
    );
    expect(sessionCookieSecure("https://sugarplum.example/api/auth/login")).toBe(
      true,
    );
    expect(sessionCookieSecure(new URL("http://127.0.0.1:5173/"))).toBe(false);
    expect(sessionCookieSecure(new URL("https://app.example/"))).toBe(true);
  });
});

describe("Google OAuth", () => {
  it("start redirects to Google authorize URL", async () => {
    const env = createTestEnv();
    const res = await app.request("/api/auth/google/start", { method: "GET" }, env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location");
    expect(loc).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(loc).toContain("client_id=test-google-client-id");
    expect(loc).toContain("code_challenge_method=S256");
  });

  it("start returns 503 when Google secrets are missing", async () => {
    const env = createTestEnv();
    env.GOOGLE_CLIENT_ID = "";
    env.GOOGLE_CLIENT_SECRET = "";
    const res = await app.request("/api/auth/google/start", { method: "GET" }, env);
    expect(res.status).toBe(503);
  });

  it("callback creates OAuth-only user and sets session", async () => {
    const env = createTestEnv();
    const state = "state-new";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-1",
      email: "oauth@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      { method: "GET" },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);

    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: setCookie.split(";")[0]! } },
      env,
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as { email: string };
    expect(body.email).toBe("oauth@example.com");
  });

  it("callback refuses to auto-link a password account (hijack guard)", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "link@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const state = "state-link";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-link",
      email: "link@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      { method: "GET" },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_link_required",
    );
  });

  it("callback links Google onto an oauth-only email row", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-o2",
      email: "orphan@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const state = "state-orphan-link";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-orphan",
      email: "orphan@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      { method: "GET" },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/");
    const setCookie = res.headers.get("set-cookie") ?? "";
    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: setCookie.split(";")[0]! } },
      env,
    );
    expect(me.status).toBe(200);
  });

  it("callback redirects when email has a different Google subject", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-b",
      email: "taken@example.com",
      password_hash: null,
      oauth_subject: googleOauthSubject("other-sub"),
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const state = "state-conflict";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "new-sub",
      email: "taken@example.com",
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      { method: "GET" },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_conflict",
    );
  });

  it("callback rejects unverified Google email", async () => {
    const env = createTestEnv();
    const state = "state-unverified";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-uv",
      email: "uv@example.com",
      email_verified: false,
    });

    const res = await app.request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      { method: "GET" },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=oauth",
    );
  });

  it("password login rejects OAuth-only users", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-o",
      email: "only@example.com",
      password_hash: null,
      oauth_subject: googleOauthSubject("only-sub"),
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "only@example.com",
          password: "anything-at-all",
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
