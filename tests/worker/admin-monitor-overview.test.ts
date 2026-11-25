import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
  seedSession,
  seedUsageEvent,
  seedUser,
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
