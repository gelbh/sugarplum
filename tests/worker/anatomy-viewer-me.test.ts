import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

describe("GET /api/auth/me anatomy_viewer", () => {
  it("false when secret unset", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "u1",
      email: "gelbharttomer@gmail.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s1", "u1");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ anatomy_viewer: false });
  });

  it("true for allowlisted email without Google link", async () => {
    const env = createTestEnv({
      anatomyViewerEmails: "kyleygelbhart@gmail.com, gelbharttomer@gmail.com",
    });
    env.seedUser({
      id: "u1",
      email: "GelbhartTomer@gmail.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s1", "u1");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ anatomy_viewer: true });
  });

  it("false for admin who is not on anatomy list", async () => {
    const env = createTestEnv({
      adminEmails: "ops@example.com",
      anatomyViewerEmails: "kyleygelbhart@gmail.com",
    });
    env.seedUser({
      id: "u1",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "google-sub",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s1", "u1");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      is_admin: true,
      anatomy_viewer: false,
    });
  });
});
