import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb, seedUser } from "../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../../worker/index";
import { hashPassword } from "../../../worker/auth/password";

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