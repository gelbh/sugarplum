import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getExportJobs,
  getMaterials,
  getR2Keys,
  getUserSecrets,
  resetTestDb,
  seedCard,
  seedDeck,
  seedExportJob,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUsageEvent,
  seedUser,
  seedUserSecret,
  seedUserStudyDay,
  withTestBindings,
} from "./harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { hashPassword } from "../../worker/auth/password";
import { isAdminUser, parseAdminEmails } from "../../worker/admin/allowlist";

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

async function seedAdminMonitorFixture(env: Bindings) {
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
  await seedUser(env, {
    id: "u-bob",
    email: "bob@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-10-25T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-alice",
    user_id: "u-alice",
    title: "Alice deck",
    subject_hint: null,
    created_at: "2026-10-28T01:00:00.000Z",
  });
  await seedMaterial(env, {
    id: "mat-alice",
    deck_id: "deck-alice",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-10-28T01:00:00.000Z",
  });
  await seedGenerationJob(env, {
    id: "job-alice",
    material_id: "mat-alice",
    status: "done",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-10-28T02:00:00.000Z",
    finished_at: "2026-10-28T02:05:00.000Z",
  });
  await seedCard(env, {
    id: "card-a1",
    deck_id: "deck-alice",
    job_id: "job-alice",
    type: "qa",
    front_json: "{}",
    back_json: "{}",
    media_r2_keys_json: null,
    provenance_json: null,
    status: "accepted",
    created_at: "2026-10-28T02:10:00.000Z",
    updated_at: "2026-10-28T02:10:00.000Z",
  });
  await seedCard(env, {
    id: "card-a2",
    deck_id: "deck-alice",
    job_id: "job-alice",
    type: "qa",
    front_json: "{}",
    back_json: "{}",
    media_r2_keys_json: null,
    provenance_json: null,
    status: "draft",
    created_at: "2026-10-28T02:11:00.000Z",
    updated_at: "2026-10-28T02:11:00.000Z",
  });
  await seedSession(env, "s-admin", "admin-u");
}

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
    const base = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    const env: Bindings = {
      ...base,
      DB: new Proxy(base.DB, {
        get(target, prop, _receiver) {
          if (prop === "prepare") {
            return (query: string) => {
              if (query.includes("sugarplum:admin-list-metrics")) {
                metricsPrepares += 1;
              }
              return target.prepare(query);
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function"
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
      }),
    };
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

describe("disabled_at auth enforcement", () => {
  it("401 on /api/auth/me for disabled user with valid session", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-disabled",
      email: "disabled@example.com",
      password_hash: null,
      oauth_subject: "google-disabled",
      created_at: "2026-01-01T00:00:00.000Z",
      disabled_at: "2026-10-29T09:00:00.000Z",
    });
    await seedSession(env, "s-disabled", "u-disabled");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s-disabled` } },
      env,
    );
    expect(res.status).toBe(401);
    const kv = await env.SESSIONS.get("s-disabled");
    expect(kv).toBeNull();
  });

  it("login as disabled returns 401 without minting a session", async () => {
    const env = cfEnv;
    const password = "long-enough-password";
    await seedUser(env, {
      id: "u-disabled-pw",
      email: "disabled-pw@example.com",
      password_hash: await hashPassword(password),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
      disabled_at: "2026-10-29T09:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (
          String(input) ===
          "https://challenges.cloudflare.com/turnstile/v0/siteverify"
        ) {
          return new Response(
            JSON.stringify({ success: true, action: "login" }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "disabled-pw@example.com",
          password,
          turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/invalid email or password/i);
    expect(res.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it("admin list includes disabled_at when set", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-bob",
      email: "bob@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-10-25T00:00:00.000Z",
      disabled_at: "2026-10-29T11:00:00.000Z",
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { email: string; disabled_at: string | null }[];
    };
    const bob = body.users.find((u) => u.email === "bob@example.com");
    expect(bob?.disabled_at).toBe("2026-10-29T11:00:00.000Z");
    const alice = body.users.find((u) => u.email === "alice@example.com");
    expect(alice?.disabled_at).toBeNull();
  });
});

const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};

describe("POST /api/admin/users/:id/disable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("400 when target email is allowlisted", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/admin-u/disable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(400);
    const detail = await app.request(
      "/api/admin/users/admin-u",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    const body = (await detail.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBeNull();
  });

  it("sets disabled_at for non-allowlisted user", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/u-alice/disable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(200);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    const body = (await detail.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBe("2026-10-29T12:00:00.000Z");
  });

  it("404 when user missing", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/missing/disable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/users/:id/enable", () => {
  it("clears disabled_at", async () => {
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
      "/api/admin/users/u-alice/enable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(200);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    const body = (await detail.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBeNull();
  });
});

describe("POST /api/admin/users/:id/wipe", () => {
  async function seedWipeTarget(env: Bindings) {
    await seedAdminMonitorFixture(env);
    await seedMaterial(env, {
      id: "mat-alice",
      deck_id: "deck-alice",
      kind: "paste",
      r2_key: "materials/deck-alice/mat-alice.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-10-28T01:00:00.000Z",
    });
    await seedCard(env, {
      id: "card-a1",
      deck_id: "deck-alice",
      job_id: "job-alice",
      type: "qa",
      front_json: '{"q":"front"}',
      back_json: '{"a":"back"}',
      media_r2_keys_json: '["materials/deck-alice/fig-1.png"]',
      provenance_json: null,
      status: "accepted",
      created_at: "2026-10-28T02:10:00.000Z",
      updated_at: "2026-10-28T02:10:00.000Z",
    });
    await seedExportJob(env, {
      id: "export-alice",
      user_id: "u-alice",
      status: "ready",
      request_json: "{}",
      r2_key: "exports/u-alice/export-alice.apkg",
      error: null,
      warning_json: null,
      created_at: "2026-10-28T03:00:00.000Z",
      updated_at: "2026-10-28T03:00:00.000Z",
      expires_at: "2026-10-30T03:00:00.000Z",
    });
    await seedUserSecret(env, {
      user_id: "u-alice",
      provider: "openai",
      ciphertext: "secret-cipher",
      created_at: "2026-10-28T00:00:00.000Z",
      updated_at: "2026-10-28T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-alice-pdf",
      deck_id: "deck-alice",
      kind: "pdf",
      r2_key: "materials/deck-alice/mat-alice.pdf",
      filename: "lecture.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-10-28T01:05:00.000Z",
    });
    await seedR2(env, "materials/deck-alice/mat-alice.txt", "paste body");
    await seedR2(env, "materials/deck-alice/mat-alice.pdf", "pdf-bytes");
    await seedR2(env, "materials/deck-alice/fig-1.png", "png-bytes");
    await seedR2(env, "materials/deck-alice/figures/mat-alice-pdf/0.png", "crop");
    await seedR2(env, "exports/u-alice/export-alice.apkg", "apkg-bytes");
  }

  it("400 when confirmEmail mismatches; user remains", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedWipeTarget(env);
    const res = await app.request(
      "/api/admin/users/u-alice/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "wrong@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(detail.status).toBe(200);
    expect((await getCards(env)).some((c) => c.deck_id === "deck-alice")).toBe(true);
    expect((await getR2Keys(env))).toContain("materials/deck-alice/mat-alice.txt");
  });

  it("400 when wipe target is allowlisted", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/admin-u/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "ops@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("deletes user CASCADE and best-effort R2 keys on confirm", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedWipeTarget(env);
    const res = await app.request(
      "/api/admin/users/u-alice/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "ALICE@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(detail.status).toBe(404);
    expect((await getCards(env)).some((c) => c.deck_id === "deck-alice")).toBe(false);
    expect((await getMaterials(env)).some((m) => m.deck_id === "deck-alice")).toBe(
      false,
    );
    expect((await getUserSecrets(env)).some((s) => s.user_id === "u-alice")).toBe(
      false,
    );
    expect((await getExportJobs(env)).some((j) => j.user_id === "u-alice")).toBe(
      false,
    );
    expect((await getR2Keys(env))).not.toContain("materials/deck-alice/mat-alice.txt");
    expect((await getR2Keys(env))).not.toContain("materials/deck-alice/mat-alice.pdf");
    expect((await getR2Keys(env))).not.toContain("materials/deck-alice/fig-1.png");
    expect((await getR2Keys(env))).not.toContain(
      "materials/deck-alice/figures/mat-alice-pdf/0.png",
    );
    expect((await getR2Keys(env))).not.toContain("exports/u-alice/export-alice.apkg");
    expect((await getR2Keys(env))).toEqual([]);
  });
});

describe("GET /api/admin/users/:id/export", () => {
  it("includes card fronts and material text; omits secrets and password_hash", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-alice",
      email: "alice@example.com",
      password_hash: "should-never-export",
      oauth_subject: "google-alice",
      created_at: "2026-10-28T00:00:00.000Z",
    });
    await seedUserSecret(env, {
      user_id: "u-alice",
      provider: "openai",
      ciphertext: "secret-cipher",
      created_at: "2026-10-28T00:00:00.000Z",
      updated_at: "2026-10-28T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-alice",
      deck_id: "deck-alice",
      kind: "paste",
      r2_key: "materials/deck-alice/mat-alice.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-10-28T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-pdf",
      deck_id: "deck-alice",
      kind: "pdf",
      r2_key: "materials/deck-alice/mat-pdf.pdf",
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-10-28T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "card-a1",
      deck_id: "deck-alice",
      job_id: "job-alice",
      type: "qa",
      front_json: '{"q":"What is X?"}',
      back_json: '{"a":"Y"}',
      media_r2_keys_json: null,
      provenance_json: '{"src":1}',
      status: "accepted",
      created_at: "2026-10-28T02:10:00.000Z",
      updated_at: "2026-10-28T02:10:00.000Z",
    });
    await seedR2(env, "materials/deck-alice/mat-alice.txt", "hello paste body");
    await seedR2(env, "materials/deck-alice/mat-pdf.pdf", "%PDF-binary");

    const res = await app.request(
      "/api/admin/users/u-alice/export",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("should-never-export");
    expect(raw).not.toContain("secret-cipher");
    expect(raw).not.toContain("password_hash");
    expect(raw).not.toContain("user_secrets");
    const body = JSON.parse(raw) as {
      user: { id: string; email: string };
      cards: { id: string; front_json: string; back_json: string }[];
      materials: {
        id: string;
        kind: string;
        text?: string;
        r2_key?: string;
        filename?: string | null;
      }[];
    };
    expect(body.user).toMatchObject({
      id: "u-alice",
      email: "alice@example.com",
    });
    expect(body.cards.some((c) => c.front_json === '{"q":"What is X?"}')).toBe(
      true,
    );
    const paste = body.materials.find((m) => m.id === "mat-alice");
    expect(paste?.text).toBe("hello paste body");
    const pdf = body.materials.find((m) => m.id === "mat-pdf");
    expect(pdf).toMatchObject({
      kind: "pdf",
      r2_key: "materials/deck-alice/mat-pdf.pdf",
      filename: "slides.pdf",
      size: new TextEncoder().encode("%PDF-binary").byteLength,
    });
    expect(pdf).not.toHaveProperty("text");
    expect(Object.keys(body.user)).not.toContain("password_hash");
  });

  it("404 when user missing", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/missing/export",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(404);
  });
});
