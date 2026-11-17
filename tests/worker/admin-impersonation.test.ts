import { describe, it, expect, vi, afterEach } from "vitest";
import { app } from "../../worker/index";
import {
  IMPERSONATION_TTL_SECONDS,
  parseSessionRecord,
  SESSION_COOKIE,
} from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

const ADMIN_EMAIL = "ops@example.com";
const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};

function seedAdminAndLearner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "admin-u",
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2025-01-01T00:00:00.000Z",
  });
  env.seedUser({
    id: "u-alice",
    email: "alice@example.com",
    password_hash: null,
    oauth_subject: "google-alice",
    created_at: "2026-10-28T00:00:00.000Z",
  });
  env.seedSession("s-admin", "admin-u");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin impersonation", () => {
  it("start then exit keeps cookie id and restores actor", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const startBody = (await start.json()) as {
      ok: boolean;
      impersonation: {
        sourceUserId: string;
        sandboxUserId: string;
        sourceEmail: string;
        startedAt: number;
      };
    };
    expect(startBody.ok).toBe(true);
    expect(startBody.impersonation.sourceUserId).toBe("u-alice");
    expect(startBody.impersonation.sourceEmail).toBe("alice@example.com");
    expect(startBody.impersonation.sandboxUserId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );

    const rawWhile = await env.SESSIONS.get("s-admin");
    expect(rawWhile).toBeTruthy();
    const whileRec = parseSessionRecord(rawWhile!);
    expect(whileRec?.userId).toBe(startBody.impersonation.sandboxUserId);
    expect(whileRec?.actorUserId).toBe("admin-u");
    expect(whileRec?.impersonation?.sandboxUserId).toBe(
      startBody.impersonation.sandboxUserId,
    );

    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(exit.status).toBe(200);

    const rawAfter = await env.SESSIONS.get("s-admin");
    const afterRec = parseSessionRecord(rawAfter!);
    expect(afterRec?.userId).toBe("admin-u");
    expect(afterRec?.actorUserId).toBeUndefined();
    expect(afterRec?.impersonation).toBeUndefined();
  });

  it("/me returns source identity, actor is_admin, and impersonation block", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);

    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: "u-alice",
      email: "alice@example.com",
      google_linked: true,
      is_admin: true,
    });
    const imp = body.impersonation as {
      sourceUserId: string;
      sourceEmail: string;
      startedAt: number;
      expiresAt: number;
    };
    expect(imp.sourceUserId).toBe("u-alice");
    expect(imp.sourceEmail).toBe("alice@example.com");
    expect(imp.expiresAt).toBe(imp.startedAt + IMPERSONATION_TTL_SECONDS * 1000);
  });

  it("400 when impersonating allowlisted admin", async () => {
    const env = createTestEnv({
      adminEmails: `${ADMIN_EMAIL},ops2@example.com`,
    });
    env.seedUser({
      id: "admin-u",
      email: ADMIN_EMAIL,
      password_hash: null,
      oauth_subject: "google-admin",
      created_at: "2025-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "admin-other",
      email: "ops2@example.com",
      password_hash: null,
      oauth_subject: "google-ops2",
      created_at: "2025-01-02T00:00:00.000Z",
    });
    env.seedSession("s-admin", "admin-u");

    const res = await app.request(
      "/api/admin/users/admin-other/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      message: "Cannot modify allowlisted admin",
    });
  });

  it("400 when impersonating self", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    const res = await app.request(
      "/api/admin/users/admin-u/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      message: "Cannot impersonate yourself",
    });
  });

  it("403 for non-admin impersonate and exit", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    env.seedUser({
      id: "u-learner",
      email: "learner@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "u-alice",
      email: "alice@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedSession("s-learner", "u-learner");
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
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    env.seedUser({
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
      message: "Cannot modify sandbox user",
    });
  });

  it("does not create user_secrets on sandbox", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    env.seedUserSecret({
      user_id: "u-alice",
      provider: "openai",
      ciphertext: "enc:alice",
      model: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    const body = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const secrets = env.getUserSecrets();
    expect(
      secrets.some((s) => s.user_id === body.impersonation.sandboxUserId),
    ).toBe(false);
    expect(secrets.some((s) => s.user_id === "u-alice")).toBe(true);
  });

  it("TTL expiry restores actor and deletes sandbox", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    env.seedUser({
      id: "sandbox-expired",
      email: "sandbox+expired@sandbox.invalid",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-11-01T00:00:00.000Z",
      sandbox_of: "u-alice",
    });
    const startedAt =
      Date.now() - (IMPERSONATION_TTL_SECONDS + 60) * 1000;
    env.seedSessionRecord("s-admin", {
      userId: "sandbox-expired",
      expiresAt: Date.now() + 60_000,
      actorUserId: "admin-u",
      impersonation: {
        sourceUserId: "u-alice",
        sandboxUserId: "sandbox-expired",
        sourceEmail: "alice@example.com",
        startedAt,
      },
    });

    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(me.status).toBe(200);
    const body = (await me.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: "admin-u",
      email: ADMIN_EMAIL,
      is_admin: true,
    });
    expect(body.impersonation).toBeUndefined();

    const raw = await env.SESSIONS.get("s-admin");
    const rec = parseSessionRecord(raw!);
    expect(rec?.userId).toBe("admin-u");
    expect(rec?.impersonation).toBeUndefined();
  });

  it("403 PUT/DELETE settings/llm while impersonating", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const put = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ provider: "openai", apiKey: "sk-test" }),
      },
      env,
    );
    expect(put.status).toBe(403);

    const del = await app.request(
      "/api/settings/llm",
      { method: "DELETE", headers: adminHeaders },
      env,
    );
    expect(del.status).toBe(403);
  });

  it("GET /api/admin/users succeeds for actor during impersonation", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    const startBody = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { id: string }[] };
    expect(body.users.some((u) => u.id === "u-alice")).toBe(true);
    expect(
      body.users.some((u) => u.id === startBody.impersonation.sandboxUserId),
    ).toBe(false);
  });

  it("logout deletes sandbox user", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearner(env);
    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    const startBody = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = startBody.impersonation.sandboxUserId;

    const logout = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(logout.status).toBe(200);
    expect(env.getUsers().some((u) => u.id === sandboxId)).toBe(false);
    expect(await env.SESSIONS.get("s-admin")).toBeNull();
  });
});
