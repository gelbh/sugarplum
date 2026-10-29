import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../worker/index";
import { isAllowedMutatingOrigin } from "../../worker/security/origin";
import { createTestEnv } from "./test-env";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubSiteverifyOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SITEVERIFY_URL) {
        return new Response(
          JSON.stringify({ success: true, action: "register" }),
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

describe("isAllowedMutatingOrigin", () => {
  it("allows missing Origin and APP_URL / localhost matches", () => {
    expect(isAllowedMutatingOrigin(undefined, "https://sugarplum.gelbhart.dev")).toBe(
      true,
    );
    expect(
      isAllowedMutatingOrigin(
        "https://sugarplum.gelbhart.dev",
        "https://sugarplum.gelbhart.dev",
      ),
    ).toBe(true);
    expect(
      isAllowedMutatingOrigin("http://localhost:5173", "https://sugarplum.gelbhart.dev"),
    ).toBe(true);
    expect(
      isAllowedMutatingOrigin("http://127.0.0.1:8787", "https://sugarplum.gelbhart.dev"),
    ).toBe(true);
    expect(
      isAllowedMutatingOrigin("https://evil.example", "https://sugarplum.gelbhart.dev"),
    ).toBe(false);
  });
});

describe("mutating /api origin middleware", () => {
  it("rejects cross-origin POST", async () => {
    const env = createTestEnv();
    env.APP_URL = "https://sugarplum.gelbhart.dev";
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          email: "x@example.com",
          password: "long-enough-password",
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("allows APP_URL origin", async () => {
    const env = createTestEnv();
    env.APP_URL = "https://sugarplum.gelbhart.dev";
    stubSiteverifyOk();
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://sugarplum.gelbhart.dev",
        },
        body: JSON.stringify({
          email: "ok@example.com",
          password: "long-enough-password",
          turnstileToken: DUMMY_TURNSTILE_TOKEN,
        }),
      },
      env,
    );
    expect(res.status).not.toBe(403);
  });

  it("fails closed when APP_URL is unset", async () => {
    const env = createTestEnv();
    env.APP_URL = "";
    const res = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "noconfig@example.com",
          password: "long-enough-password",
        }),
      },
      env,
    );
    expect(res.status).toBe(500);
  });
});
