import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedGenerationJob,
  seedSession,
  seedUser,
  seedUserStudyDay,
  withTestBindings,
  seedAdminMonitorFixture,
} from "../../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../../worker/index";
import { SESSION_COOKIE } from "../../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
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
