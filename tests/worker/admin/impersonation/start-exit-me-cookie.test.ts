import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getUsers,
  getUserSecrets,
  resetTestDb,
  seedSession,
  seedUser,
  seedUserSecret,
  withTestBindings,
} from "../../harness";
import { describe, it, expect, vi, afterEach } from "vitest";
import { app } from "../../../../worker/index";
import {
  IMPERSONATION_TTL_SECONDS,
  parseSessionRecord,
  SESSION_COOKIE,
} from "../../../../worker/auth/session";

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
  it("start then exit keeps cookie id and restores actor", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    const usersBefore = (await getUsers(env)).length;
    const beforeRec = parseSessionRecord((await env.SESSIONS.get("s-admin"))!);
    const expiresAt = beforeRec?.expiresAt;
    expect(expiresAt).toEqual(expect.any(Number));

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
        sourceEmail: string;
        startedAt: number;
      };
    };
    expect(startBody.ok).toBe(true);
    expect(startBody.impersonation.sourceUserId).toBe("u-alice");
    expect(startBody.impersonation.sourceEmail).toBe("alice@example.com");
    expect((await getUsers(env)).length).toBe(usersBefore);
    expect(
      (await getUsers(env)).filter((u) => u.sandbox_of === "u-alice"),
    ).toHaveLength(0);

    const rawWhile = await env.SESSIONS.get("s-admin");
    expect(rawWhile).toBeTruthy();
    const whileRec = parseSessionRecord(rawWhile!);
    expect(whileRec?.userId).toBe("u-alice");
    expect(whileRec?.actorUserId).toBe("admin-u");
    expect(whileRec?.impersonation?.sourceUserId).toBe("u-alice");
    expect(whileRec?.expiresAt).toBe(expiresAt);

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
    expect(afterRec?.expiresAt).toBe(expiresAt);
  });

  it("/me returns source identity, actor is_admin, and impersonation block", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);

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
    expect(imp.expiresAt).toBe(
      imp.startedAt + IMPERSONATION_TTL_SECONDS * 1000,
    );
  });

  it("does not create sandbox users or secrets rows on start", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await seedUserSecret(env, {
      user_id: "u-alice",
      provider: "openai",
      ciphertext: "enc:alice",
      model: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect((await getUsers(env)).filter((u) => u.sandbox_of != null)).toHaveLength(0);
    expect((await getUserSecrets(env)).some((s) => s.user_id === "u-alice")).toBe(
      true,
    );
  });

  it("logout clears session and leaves source user intact", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const logout = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(logout.status).toBe(200);
    expect((await getUsers(env)).some((u) => u.id === "u-alice")).toBe(true);
    expect(await env.SESSIONS.get("s-admin")).toBeNull();
  });
});
