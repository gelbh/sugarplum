import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb, seedUser } from "../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../../worker/index";
import {
  GOOGLE_TOKEN_URL,
  OAUTH_KV_PREFIX,
  googleOauthSubject,
} from "../../../worker/auth/google";
import { OAUTH_CTX_COOKIE, oauthDoneKey } from "../../../worker/auth/oauth-replay";
import { hashPassword } from "../../../worker/auth/password";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { oauthCtxHeader, stubGoogleTokenAndProfile } from "./oauth-stubs";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

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
});