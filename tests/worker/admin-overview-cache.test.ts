import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  clearCache,
  getAdminOverviewPrepareCount,
  installAdminOverviewPrepareCounter,
  resetTestDb,
  seedSession,
  seedUser,
  withTestBindings,
} from "./harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedAdmin(env: Bindings) {
  await seedUser(env, {
    id: "admin-u",
    email: "ops@example.com",
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

describe("GET /api/admin/overview CACHE", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("second call hits KV and skips overview D1 prepare", async () => {
    const env = installAdminOverviewPrepareCounter(withTestBindings(cfEnv, { adminEmails: "ops@example.com" }));
    await seedAdmin(env);

    const first = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(getAdminOverviewPrepareCount()).toBe(1);

    await seedUser(env, {
      id: "u-late",
      email: "late@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-10-29T11:00:00.000Z",
    });

    const second = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual(firstBody);
    expect(getAdminOverviewPrepareCount()).toBe(1);

    (await clearCache(env));
    const third = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(third.status).toBe(200);
    await expect(third.json()).resolves.toMatchObject({ userCount: 3 });
    expect(getAdminOverviewPrepareCount()).toBe(2);
  });
});
