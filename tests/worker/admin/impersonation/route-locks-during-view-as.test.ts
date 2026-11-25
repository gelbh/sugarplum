import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUser,
  withTestBindings,
} from "../../harness";
import { describe, it, expect, vi, afterEach } from "vitest";
import { app } from "../../../../worker/index";
import { SESSION_COOKIE } from "../../../../worker/auth/session";
import { VIEW_AS_READ_ONLY_CODE } from "../../../../src/api/problemWire";

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
  it("403 PUT/DELETE settings/llm while impersonating", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
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
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { id: string }[] };
    expect(body.users.some((u) => u.id === "u-alice")).toBe(true);
  });

  it("403 GET OAuth/calendar connect and fsrs-optimize during view-as", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    const cookie = { cookie: `${SESSION_COOKIE}=s-admin` };
    const connect = await app.request(
      "/api/calendar/connect",
      { headers: cookie },
      env,
    );
    expect(connect.status).toBe(403);
    const link = await app.request(
      "/api/auth/google/start?intent=link",
      { headers: cookie },
      env,
    );
    expect(link.status).toBe(403);
    const fsrs = await app.request(
      "/api/settings/study/fsrs-optimize",
      { headers: cookie },
      env,
    );
    expect(fsrs.status).toBe(403);
  });

  it("403 admin wipe during view-as (Exit and logout only)", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearner(env);
    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    const wipe = await app.request(
      "/api/admin/users/u-alice/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "alice@example.com" }),
      },
      env,
    );
    expect(wipe.status).toBe(403);
    expect(wipe.headers.get("content-type")).toMatch(
      /application\/problem\+json/i,
    );
    expect(await wipe.json()).toMatchObject({
      type: "https://sugarplum.gelbhart.dev/problems/view-as-read-only",
      title: "Read-only while viewing as user",
      status: 403,
      detail: "Read-only while viewing as user",
      code: VIEW_AS_READ_ONLY_CODE,
    });
  });
});
