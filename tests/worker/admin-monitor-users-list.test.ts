import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedUsageEvent,
  seedUser,
  installSqlMarkerCounter,
  withTestBindings,
  seedAdminMonitorFixture,
} from "./harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("GET /api/admin/users (allowlisted)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("200 with heavy user rows", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUsageEvent(env, {
      id: "ue-alice",
      user_id: "u-alice",
      created_at: "2026-10-29T08:00:00.000Z",
      tokens_total: 100,
      tokens_prompt: null,
      tokens_completion: null,
      path: "free",
      kind: "generation",
      job_id: null,
      provider: null,
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: {
        id: string;
        email: string;
        google_linked: boolean;
        decks: number;
        cards: number;
        jobs: number;
        materials: number;
        tokens30d: number;
        last_activity_at: string;
      }[];
    };
    expect(body.users).toHaveLength(3);
    const alice = body.users.find((u) => u.email === "alice@example.com");
    expect(alice).toMatchObject({
      id: "u-alice",
      google_linked: true,
      decks: 1,
      cards: 2,
      jobs: 1,
      materials: 1,
      tokens30d: 100,
      last_activity_at: "2026-10-29T08:00:00.000Z",
    });
    const bob = body.users.find((u) => u.email === "bob@example.com");
    expect(bob).toMatchObject({
      google_linked: false,
      decks: 0,
    });
  });

  it("filters by status and google", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-disabled",
      email: "disabled@example.com",
      password_hash: null,
      oauth_subject: "google-disabled",
      created_at: "2026-10-27T00:00:00.000Z",
      disabled_at: "2026-10-28T00:00:00.000Z",
    });
    const disabledRes = await app.request(
      "/api/admin/users?status=disabled",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(disabledRes.status).toBe(200);
    const disabledBody = (await disabledRes.json()) as {
      users: { email: string }[];
    };
    expect(disabledBody.users.map((u) => u.email)).toEqual([
      "disabled@example.com",
    ]);

    const googleRes = await app.request(
      "/api/admin/users?google=no",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(googleRes.status).toBe(200);
    const googleBody = (await googleRes.json()) as {
      users: { email: string }[];
    };
    expect(googleBody.users.map((u) => u.email)).toEqual(["bob@example.com"]);
  });

  it("sorts by tokens_30d ascending", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUsageEvent(env, {
      id: "ue-alice-2",
      user_id: "u-alice",
      created_at: "2026-10-29T08:00:00.000Z",
      tokens_total: 50,
      tokens_prompt: null,
      tokens_completion: null,
      path: "free",
      kind: "generation",
      job_id: null,
      provider: null,
    });
    await seedUsageEvent(env, {
      id: "ue-bob-2",
      user_id: "u-bob",
      created_at: "2026-10-29T09:00:00.000Z",
      tokens_total: 200,
      tokens_prompt: null,
      tokens_completion: null,
      path: "free",
      kind: "generation",
      job_id: null,
      provider: null,
    });
    const res = await app.request(
      "/api/admin/users?sort=tokens_30d&dir=asc",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { email: string; tokens30d: number }[];
    };
    expect(body.users.map((u) => u.email)).toEqual([
      "ops@example.com",
      "alice@example.com",
      "bob@example.com",
    ]);
    expect(body.users.map((u) => u.tokens30d)).toEqual([0, 50, 200]);
  });

  it("filters by q on email", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users?q=ALICE",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string }[] };
    expect(body.users.map((u) => u.email)).toEqual(["alice@example.com"]);
  });

  async function seedManyListUsers(
    env: Bindings,
    count: number,
  ) {
    await seedUser(env, {
      id: "admin-u",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "google-admin",
      created_at: "2025-01-01T00:00:00.000Z",
    });
    await seedSession(env, "s-admin", "admin-u");
    for (let i = 0; i < count; i++) {
      await seedUser(env, {
        id: `bulk-u-${i}`,
        email: `user-${String(i).padStart(3, "0")}@example.com`,
        password_hash: null,
        oauth_subject: null,
        created_at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      });
    }
  }

  it("defaults limit to 50 when omitted", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedManyListUsers(env, 55);
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(50);
  });

  it("clamps limit to 100", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedManyListUsers(env, 110);
    const res = await app.request(
      "/api/admin/users?limit=999",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(100);
  });

  it("falls back to limit 50 when limit is invalid", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedManyListUsers(env, 55);
    const res = await app.request(
      "/api/admin/users?limit=nope",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(50);
  });

  it("chunks metrics queries when limit exceeds 12", async () => {
    let metricsPrepares = 0;
    const env = installSqlMarkerCounter(
      withTestBindings(cfEnv, { adminEmails: "ops@example.com" }),
      "sugarplum:admin-list-metrics",
      () => {
        metricsPrepares += 1;
      },
    );
    await seedManyListUsers(env, 13);
    const res = await app.request(
      "/api/admin/users?limit=13",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(13);
    expect(metricsPrepares).toBe(2);
  });
});
