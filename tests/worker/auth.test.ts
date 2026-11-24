import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import {
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  OAUTH_KV_PREFIX,
  googleOauthSubject,
} from "../../worker/auth/google";
import {
  OAUTH_CTX_COOKIE,
  oauthDoneKey,
} from "../../worker/auth/oauth-replay";
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

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function oauthCtxHeader(state: string): { cookie: string } {
  return { cookie: `${OAUTH_CTX_COOKIE}=${state}` };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubSiteverify(opts?: {
  success?: boolean;
  action?: string;
  testingKey?: boolean;
}) {
  const success = opts?.success ?? true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SITEVERIFY_URL) {
        return new Response(
          JSON.stringify({
            success,
            ...(opts?.action != null ? { action: opts.action } : {}),
            ...(opts?.testingKey
              ? { metadata: { result_with_testing_key: true } }
              : {}),
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
    const env = cfEnv;
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
    const env = cfEnv;
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

describe("auth turnstile", () => {
  it("GET /turnstile returns siteKey", async () => {
    const env = cfEnv;
    const res = await app.request("/api/auth/turnstile", { method: "GET" }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      siteKey: "1x00000000000000000000AA",
    });
  });

  it("register without token returns 403", async () => {
    const env = cfEnv;
    stubSiteverify();
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "long-enough-password",
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("register with failed siteverify returns 403", async () => {
    const env = cfEnv;
    stubSiteverify({ success: false });
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "long-enough-password",
          turnstileToken: DUMMY_TURNSTILE_TOKEN,
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("register succeeds when siteverify passes", async () => {
    const env = cfEnv;
    stubSiteverify({ success: true, action: "register" });
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "ok@example.com",
          password: "long-enough-password",
          turnstileToken: DUMMY_TURNSTILE_TOKEN,
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe("ok@example.com");
  });

  it("login without token returns 403", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u1",
      email: "u@example.com",
      password_hash: await hashPassword("long-enough-password"),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    stubSiteverify({ action: "login" });
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "u@example.com",
          password: "long-enough-password",
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("register rejects success without matching action", async () => {
    const env = cfEnv;
    stubSiteverify({ success: true });
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "act@example.com",
          password: "long-enough-password",
          turnstileToken: DUMMY_TURNSTILE_TOKEN,
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("register accepts testing-key siteverify without action", async () => {
    const env = cfEnv;
    stubSiteverify({ success: true, testingKey: true });
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "dummy-key@example.com",
          password: "long-enough-password",
          turnstileToken: DUMMY_TURNSTILE_TOKEN,
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
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
    const env = cfEnv;
    const res = await app.request("/api/auth/google/start", { method: "GET" }, env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location");
    expect(loc).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(loc).toContain("client_id=test-google-client-id");
    expect(loc).toContain("code_challenge_method=S256");
    expect(res.headers.get("set-cookie") ?? "").toContain(`${OAUTH_CTX_COOKIE}=`);
  });

  it("start returns 503 when Google secrets are missing", async () => {
    const env = { ...cfEnv, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" };
    const res = await app.request("/api/auth/google/start", { method: "GET" }, env);
    expect(res.status).toBe(503);
  });

  it("callback redirects to /today and sets session", async () => {
    const env = cfEnv;
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
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/today");
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

  it("callback without oauth ctx cookie fails", async () => {
    const env = cfEnv;
    const state = "state-no-ctx";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-no-ctx",
      email: "noct@example.com",
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
    expect(res.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it("duplicate callback with same code after success redirects to /today without error", async () => {
    const env = cfEnv;
    const state = "state-dup";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-dup",
      email: "dup@example.com",
    });

    const first = await app.request(
      `/api/auth/google/callback?code=dup-code&state=${state}`,
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("http://localhost/today");
    expect(await env.SESSIONS.get(`${OAUTH_KV_PREFIX}${state}`)).toBeNull();
    expect(await env.SESSIONS.get(oauthDoneKey(state))).toBeTruthy();

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const tokenCallsAfterFirst = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === GOOGLE_TOKEN_URL,
    ).length;

    const second = await app.request(
      `/api/auth/google/callback?code=dup-code&state=${state}`,
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe("http://localhost/today");
    expect(second.headers.get("location")).not.toContain("error=");

    const tokenCallsAfterSecond = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === GOOGLE_TOKEN_URL,
    ).length;
    expect(tokenCallsAfterSecond).toBe(tokenCallsAfterFirst);
  });

  it("done replay without oauth ctx cookie does not mint a session", async () => {
    const env = cfEnv;
    const state = "state-naked";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-naked",
      email: "naked@example.com",
    });

    const first = await app.request(
      `/api/auth/google/callback?code=naked&state=${state}`,
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("http://localhost/today");

    const second = await app.request(
      `/api/auth/google/callback?state=${state}`,
      { method: "GET" },
      env,
    );
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe(
      "http://localhost/login?error=oauth",
    );
    expect(second.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it("done replay with matching session cookie redirects home without reminting", async () => {
    const env = cfEnv;
    const state = "state-sess-replay";
    await env.SESSIONS.put(
      `${OAUTH_KV_PREFIX}${state}`,
      JSON.stringify({ codeVerifier: "verifier", createdAt: Date.now() }),
    );
    stubGoogleTokenAndProfile({
      sub: "g-sub-sess-replay",
      email: "sessreplay@example.com",
    });

    const first = await app.request(
      `/api/auth/google/callback?code=sess-replay&state=${state}`,
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(first.status).toBe(302);
    const sessionPair = (first.headers.get("set-cookie") ?? "")
      .split(",")
      .flatMap((part) => part.split(";"))
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    expect(sessionPair).toBeTruthy();

    const second = await app.request(
      `/api/auth/google/callback?state=${state}`,
      { method: "GET", headers: { cookie: sessionPair! } },
      env,
    );
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe("http://localhost/today");
    expect(second.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it("callback refuses to auto-link a password account (hijack guard)", async () => {
    const env = cfEnv;
    await seedUser(env, {
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
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_link_required",
    );
  });

  it("callback links Google onto an oauth-only email row", async () => {
    const env = cfEnv;
    await seedUser(env, {
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
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/today");
    const setCookie = res.headers.get("set-cookie") ?? "";
    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: setCookie.split(";")[0]! } },
      env,
    );
    expect(me.status).toBe(200);
  });

  it("callback redirects when email has a different Google subject", async () => {
    const env = cfEnv;
    await seedUser(env, {
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
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_conflict",
    );
  });

  it("callback rejects unverified Google email", async () => {
    const env = cfEnv;
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
      { method: "GET", headers: oauthCtxHeader(state) },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=oauth",
    );
  });

  it("password login rejects OAuth-only users", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "user-o",
      email: "only@example.com",
      password_hash: null,
      oauth_subject: googleOauthSubject("only-sub"),
      created_at: "2026-01-01T00:00:00.000Z",
    });
    stubSiteverify({ success: true, action: "login" });
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "only@example.com",
          password: "anything-at-all",
          turnstileToken: DUMMY_TURNSTILE_TOKEN,
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

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
