import { describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

describe("app.onError", () => {
  it("returns bare HTTPException as problem+json with its status", async () => {
    const env = createTestEnv();
    const res = await app.request(
      "/api/cards/any/regen",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "qa" }),
      },
      env,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(
      /application\/problem\+json/i,
    );
    expect(await res.json()).toMatchObject({
      type: "https://sugarplum.gelbhart.dev/problems/http-exception",
      title: "Unauthorized",
      status: 401,
      detail: "Unauthorized",
    });
  });

  it("hides unexpected error details behind a generic 500 problem+json", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.DB.prepare = () => {
      throw new Error("secret boom");
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const res = await app.request(
        "/api/subjects",
        { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
        env,
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toMatch(
        /application\/problem\+json/i,
      );
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({
        type: "https://sugarplum.gelbhart.dev/problems/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Internal Server Error",
      });
      expect(text).not.toContain("secret boom");
    } finally {
      consoleError.mockRestore();
    }
  });
});
