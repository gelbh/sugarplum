import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";
import { parseAdminEmails } from "../../worker/admin/allowlist";

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

describe("GET /api/admin/users", () => {
  it("401 without session", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    const res = await app.request("/api/admin/users", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 when signed in but not allowlisted", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    env.seedUser({
      id: "u1",
      email: "learner@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s1", "u1");
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 when ADMIN_EMAILS empty", async () => {
    const env = createTestEnv(); // no adminEmails
    env.seedUser({
      id: "u1",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "google-ops",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s1", "u1");
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 when allowlisted but password-only (no oauth_subject)", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    env.seedUser({
      id: "u-pw",
      email: "ops@example.com",
      password_hash: "x",
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s-pw", "u-pw");
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-pw` } },
      env,
    );
    expect(res.status).toBe(403);
  });
});

function seedAdminMonitorFixture(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "admin-u",
    email: "ops@example.com",
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
  env.seedUser({
    id: "u-bob",
    email: "bob@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-10-25T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-alice",
    user_id: "u-alice",
    title: "Alice deck",
    subject_hint: null,
    created_at: "2026-10-28T01:00:00.000Z",
  });
  env.seedMaterial({
    id: "mat-alice",
    deck_id: "deck-alice",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-10-28T01:00:00.000Z",
  });
  env.seedGenerationJob({
    id: "job-alice",
    material_id: "mat-alice",
    status: "done",
    error: null,
    coverage_json: null,
    progress_json: null,
    created_at: "2026-10-28T02:00:00.000Z",
    finished_at: "2026-10-28T02:05:00.000Z",
  });
  env.seedCard({
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
  env.seedCard({
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
  env.seedSession("s-admin", "admin-u");
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
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    const res = await app.request("/api/admin/overview", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 when not allowlisted", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    env.seedUser({
      id: "u1",
      email: "learner@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("s1", "u1");
    const res = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s1` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns user totals for allowlisted admin", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/overview",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      userCount: 3,
      createdLast7d: 2,
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

  it("200 with aggregated user rows", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    seedAdminMonitorFixture(env);
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
        deckCount: number;
        cardCount: number;
        jobCount: number;
      }[];
    };
    expect(body.users).toHaveLength(3);
    const alice = body.users.find((u) => u.email === "alice@example.com");
    expect(alice).toMatchObject({
      id: "u-alice",
      google_linked: true,
      deckCount: 1,
      cardCount: 2,
      jobCount: 1,
    });
    const bob = body.users.find((u) => u.email === "bob@example.com");
    expect(bob).toMatchObject({
      google_linked: false,
      deckCount: 0,
      cardCount: 0,
      jobCount: 0,
    });
  });

  it("filters by q on email", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users?q=ALICE",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string }[] };
    expect(body.users.map((u) => u.email)).toEqual(["alice@example.com"]);
  });

  function seedManyListUsers(env: ReturnType<typeof createTestEnv>, count: number) {
    env.seedUser({
      id: "admin-u",
      email: "ops@example.com",
      password_hash: null,
      oauth_subject: "google-admin",
      created_at: "2025-01-01T00:00:00.000Z",
    });
    env.seedSession("s-admin", "admin-u");
    for (let i = 0; i < count; i++) {
      env.seedUser({
        id: `bulk-u-${i}`,
        email: `user-${String(i).padStart(3, "0")}@example.com`,
        password_hash: null,
        oauth_subject: null,
        created_at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      });
    }
  }

  it("defaults limit to 50 when omitted", async () => {
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    seedManyListUsers(env, 55);
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
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    seedManyListUsers(env, 110);
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
    const env = createTestEnv({ adminEmails: "ops@example.com" });
    seedManyListUsers(env, 55);
    const res = await app.request(
      "/api/admin/users?limit=nope",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(50);
  });
});
