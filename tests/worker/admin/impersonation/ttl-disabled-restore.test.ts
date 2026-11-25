import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getUsers,
  resetTestDb,
  seedDeck,
  seedSession,
  seedSessionRecord,
  seedUser,
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
  it("TTL expiry restores actor without deleting users", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    const usersBefore = (await getUsers(env)).length;
    const startedAt = Date.now() - (IMPERSONATION_TTL_SECONDS + 60) * 1000;
    await seedSessionRecord(env, "s-admin", {
      userId: "u-alice",
      expiresAt: Date.now() + 60_000,
      actorUserId: "admin-u",
      impersonation: {
        sourceUserId: "u-alice",
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
    expect((await getUsers(env)).length).toBe(usersBefore);
    expect((await getUsers(env)).some((u) => u.id === "u-alice")).toBe(true);

    const raw = await env.SESSIONS.get("s-admin");
    const rec = parseSessionRecord(raw!);
    expect(rec?.userId).toBe("admin-u");
    expect(rec?.impersonation).toBeUndefined();
  });

  it("401 GET /api/admin/users when actor disabled mid-impersonation", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    await seedUser(env, {
      id: "admin-u",
      email: ADMIN_EMAIL,
      password_hash: null,
      oauth_subject: "google-admin",
      created_at: "2025-01-01T00:00:00.000Z",
      disabled_at: "2026-11-21T12:00:00.000Z",
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(401);
    const midRec = parseSessionRecord((await env.SESSIONS.get("s-admin"))!);
    expect(midRec?.userId).toBe("u-alice");
    expect(midRec?.actorUserId).toBe("admin-u");
    expect(midRec?.impersonation?.sourceUserId).toBe("u-alice");
  });

  it("expired view-as TTL restores actor before RO middleware", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    const startedAt = Date.now() - (IMPERSONATION_TTL_SECONDS + 60) * 1000;
    await seedSessionRecord(env, "s-admin", {
      userId: "u-alice",
      expiresAt: Date.now() + 60_000,
      actorUserId: "admin-u",
      impersonation: {
        sourceUserId: "u-alice",
        sourceEmail: "alice@example.com",
        startedAt,
      },
    });

    const put = await app.request(
      "/api/settings/llm",
      {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ provider: "openai", apiKey: "sk-test" }),
      },
      env,
    );
    expect(put.status).not.toBe(403);
    const raw = await env.SESSIONS.get("s-admin");
    const rec = parseSessionRecord(raw!);
    expect(rec?.userId).toBe("admin-u");
    expect(rec?.impersonation).toBeUndefined();
  });

  it("allows browsing a disabled source user", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await seedUser(env, {
      id: "u-frozen",
      email: "frozen@example.com",
      password_hash: null,
      oauth_subject: "google-frozen",
      created_at: "2026-01-01T00:00:00.000Z",
      disabled_at: "2026-11-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-frozen",
      user_id: "u-frozen",
      title: "Frozen deck",
      subject_hint: null,
      subject_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const start = await app.request(
      "/api/admin/users/u-frozen/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);

    const me = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      id: "u-frozen",
      email: "frozen@example.com",
      is_admin: true,
    });

    const decks = await app.request(
      "/api/decks",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(decks.status).toBe(200);
  });
});
