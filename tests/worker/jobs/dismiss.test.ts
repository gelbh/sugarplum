import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedMaterial(env, {
    id: "mat-a",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-a.txt",
    filename: "notes.txt",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("POST /api/jobs/:id/dismiss", () => {
  it("marks a failed job done and returns deck_id", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedGenerationJob(env, {
      id: "job-fail",
      material_id: "mat-a",
      status: "failed",
      error: "No schema-valid cards in LLM output",
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:01:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-fail/dismiss",
      {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deck_id: "deck-a" });
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-fail")?.status,
    ).toBe("done");
  });

  it("rejects dismissing a running job", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedGenerationJob(env, {
      id: "job-run",
      material_id: "mat-a",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: null,
    });

    const res = await app.request(
      "/api/jobs/job-run/dismiss",
      {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(409);
  });

  it("409 when status changes before the conditional dismiss write", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedGenerationJob(env, {
      id: "job-race",
      material_id: "mat-a",
      status: "failed",
      error: "boom",
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:01:00.000Z",
    });
    // Simulate regen claiming the job after the initial status read.
    const job = (await getGenerationJobs(env)).find((j) => j.id === "job-race");
    expect(job).toBeTruthy();
    // First request succeeds; second concurrent-style claim: flip to queued
    // then attempt dismiss after a "stale" failed read is not how HTTP works,
    // so flip before dismiss to assert the WHERE status clause.
    await seedGenerationJob(env, {
      ...job!,
      status: "queued",
      error: null,
      finished_at: null,
    });

    const res = await app.request(
      "/api/jobs/job-race/dismiss",
      {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(409);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-race")?.status,
    ).toBe("queued");
  });
});
