import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedGenerationJob,
  seedSession,
  seedUsageEvent,
  seedUser,
  seedUserStudyDay,
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


describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("401 without session", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    const res = await app.request("/api/admin/overview", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 when not allowlisted", async () => {
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
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns user totals for allowlisted admin", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      userCount: 3,
      createdLast7d: 2,
      tokens30d: 0,
      freeJobs30d: 0,
      byoJobs30d: 0,
    });
  });

  it("job path counts exclude regen rows; token sums include them", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUsageEvent(env, {
      id: "ue-gen",
      user_id: "u-alice",
      job_id: "job-1",
      kind: "generation",
      path: "free",
      provider: "workers-ai",
      tokens_prompt: 10,
      tokens_completion: 5,
      tokens_total: 15,
      created_at: "2026-10-28T00:00:00.000Z",
    });
    await seedUsageEvent(env, {
      id: "ue-regen",
      user_id: "u-alice",
      job_id: null,
      kind: "regen",
      path: "free",
      provider: "workers-ai",
      tokens_prompt: 20,
      tokens_completion: 10,
      tokens_total: 30,
      created_at: "2026-10-28T01:00:00.000Z",
    });
    const res = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      tokens30d: 45,
      freeJobs30d: 1,
      byoJobs30d: 0,
    });
  });
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


describe("GET /api/admin/users/:id", () => {
  it("401 without session", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    const res = await app.request("/api/admin/users/u-alice", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 when not allowlisted", async () => {
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
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when user missing", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/missing-user",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("200 with profile, counts, recent jobs, and study days", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedGenerationJob(env, {
      id: "job-alice-old",
      material_id: "mat-alice",
      status: "failed",
      error: "boom",
      coverage_json: null,
      progress_json: null,
      created_at: "2026-10-27T02:00:00.000Z",
      finished_at: "2026-10-27T02:01:00.000Z",
    });
    await seedUserStudyDay(env, {
      user_id: "u-alice",
      day: "2026-10-28",
      intros_used: 3,
    });
    await seedUserStudyDay(env, {
      user_id: "u-alice",
      day: "2026-10-27",
      intros_used: 1,
    });
    await seedUserStudyDay(env, {
      user_id: "u-bob",
      day: "2026-10-28",
      intros_used: 9,
    });

    const res = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      email: string;
      created_at: string;
      google_linked: boolean;
      counts: {
        decks: number;
        cards: number;
        jobs: number;
        materials: number;
      };
      recentJobs: { id: string; status: string; created_at: string }[];
      recentStudyDays: { day: string; intros_used: number }[];
    };
    expect(body).toMatchObject({
      id: "u-alice",
      email: "alice@example.com",
      created_at: "2026-10-28T00:00:00.000Z",
      google_linked: true,
      counts: { decks: 1, cards: 2, jobs: 2, materials: 1 },
    });
    expect(body.recentJobs.map((j) => j.id)).toEqual([
      "job-alice",
      "job-alice-old",
    ]);
    expect(body.recentJobs[0]).toMatchObject({
      status: "done",
      created_at: "2026-10-28T02:00:00.000Z",
    });
    expect(body.recentStudyDays).toEqual([
      { day: "2026-10-28", intros_used: 3 },
      { day: "2026-10-27", intros_used: 1 },
    ]);
  });

  it("returns empty activity arrays for user with no content", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/u-bob",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      google_linked: boolean;
      counts: Record<string, number>;
      recentJobs: unknown[];
      recentStudyDays: unknown[];
    };
    expect(body).toMatchObject({
      id: "u-bob",
      google_linked: false,
      counts: { decks: 0, cards: 0, jobs: 0, materials: 0 },
    });
    expect(body.recentJobs).toEqual([]);
    expect(body.recentStudyDays).toEqual([]);
  });

  it("includes disabled_at when present on detail", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-alice",
      email: "alice@example.com",
      password_hash: null,
      oauth_subject: "google-alice",
      created_at: "2026-10-28T00:00:00.000Z",
      disabled_at: "2026-10-29T10:00:00.000Z",
    });
    const res = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBe("2026-10-29T10:00:00.000Z");
  });
});
