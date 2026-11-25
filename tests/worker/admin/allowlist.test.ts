import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedSession,
  seedUser,
  withTestBindings,
} from "../harness";
import { describe, it, expect, afterEach } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { isAdminUser, parseAdminEmails } from "../../../worker/admin/allowlist";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


describe("parseAdminEmails", () => {
  it("lowercases and splits", () => {
    expect([...parseAdminEmails(" A@X.com , b@Y.com ")]).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
  it("empty → empty set", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails("").size).toBe(0);
  });
});


describe("isAdminUser", () => {
  it("true when allowlisted and google-linked", () => {
    expect(
      isAdminUser(
        { email: "Ops@Example.com", oauth_subject: "sub-1" },
        "ops@example.com",
      ),
    ).toBe(true);
  });
  it("false when allowlisted but oauth_subject null", () => {
    expect(
      isAdminUser(
        { email: "ops@example.com", oauth_subject: null },
        "ops@example.com",
      ),
    ).toBe(false);
  });
  it("false when empty ADMIN_EMAILS", () => {
    expect(
      isAdminUser(
        { email: "ops@example.com", oauth_subject: "sub-1" },
        undefined,
      ),
    ).toBe(false);
  });
});


describe("GET /api/auth/me is_admin", () => {
  it("true for allowlisted google-linked session", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedUser(env, {
      id: "u1",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "google-sub",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "s1", "u1");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ is_admin: true });
  });

  it("false for allowlisted password-only user", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedUser(env, {
      id: "u1",
      email: "ops@example.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "s1", "u1");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ is_admin: false });
  });
});


describe("GET /api/admin/users", () => {
  it("401 without session", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    const res = await app.request("/api/admin/users", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 when signed in but not allowlisted", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedUser(env, {
      id: "u1",
      email: "learner@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "s1", "u1");
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 when ADMIN_EMAILS empty", async () => {
    const env = cfEnv; // no adminEmails
    await seedUser(env, {
      id: "u1",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "google-ops",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "s1", "u1");
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 when allowlisted but password-only (no oauth_subject)", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedUser(env, {
      id: "u-pw",
      email: "ops@example.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "s-pw", "u-pw");
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-pw` } },
      env,
    );
    expect(res.status).toBe(403);
  });
});
