import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
  withTestBindings,
} from "./harness";
import { describe, it, expect, vi, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const ADMIN_EMAIL = "ops@example.com";
const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};

async function seedAdminAndLearner(env: Bindings) {
  await seedUser(env, {
    id: "admin-u",
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2025-01-01T00:00:00.000Z",
  });
  await seedUser(env, {
    id: "u-alice",
    email: "alice@example.com",
    password_hash: null,
    oauth_subject: "google-alice",
    created_at: "2026-10-28T00:00:00.000Z",
  });
  await seedSession(env, "s-admin", "admin-u");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin view-as impersonation", () => {
  it("400 when impersonating allowlisted admin", async () => {
    const env = withTestBindings(cfEnv, {
      adminEmails: `${ADMIN_EMAIL},ops2@example.com`,
    });
    await seedUser(env, {
      id: "admin-u",
      email: ADMIN_EMAIL,
      password_hash: null,
      oauth_subject: "google-admin",
      created_at: "2025-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "admin-other",
      email: "ops2@example.com",
      password_hash: null,
      oauth_subject: "google-ops2",
      created_at: "2025-01-02T00:00:00.000Z",
    });
    await seedSession(env, "s-admin", "admin-u");

    const res = await app.request(
      "/api/admin/users/admin-other/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      detail: "Cannot modify allowlisted admin",
      title: "Cannot modify allowlisted admin",
      status: 400,
      type: "https://sugarplum.gelbhart.dev/problems/http-exception",
    });
  });

  it("400 when impersonating self", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    const res = await app.request(
      "/api/admin/users/admin-u/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      detail: "Cannot impersonate yourself",
      title: "Cannot impersonate yourself",
      status: 400,
      type: "https://sugarplum.gelbhart.dev/problems/http-exception",
    });
  });

  it("403 for non-admin impersonate and exit", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedUser(env, {
      id: "u-learner",
      email: "learner@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "u-alice",
      email: "alice@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedSession(env, "s-learner", "u-learner");
    const headers = {
      cookie: `${SESSION_COOKIE}=s-learner`,
      "content-type": "application/json",
    };
    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers },
      env,
    );
    expect(start.status).toBe(403);
    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers },
      env,
    );
    expect(exit.status).toBe(403);
  });

  it("400 wipe of sandbox user", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await seedUser(env, {
      id: "sandbox-u",
      email: "sandbox+alice@sandbox.invalid",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-11-01T00:00:00.000Z",
      sandbox_of: "u-alice",
    });
    const res = await app.request(
      "/api/admin/users/sandbox-u/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          confirmEmail: "sandbox+alice@sandbox.invalid",
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      detail: "Cannot modify sandbox user",
      title: "Cannot modify sandbox user",
      status: 400,
      type: "https://sugarplum.gelbhart.dev/problems/http-exception",
    });
  });
});
