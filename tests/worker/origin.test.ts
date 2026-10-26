import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { isAllowedMutatingOrigin } from "../../worker/security/origin";
import { createTestEnv } from "./test-env";

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
        }),
      },
      env,
    );
    expect(res.status).not.toBe(403);
  });
});
