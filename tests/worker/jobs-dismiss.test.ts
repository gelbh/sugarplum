import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

function seedOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedMaterial({
    id: "mat-a",
    deck_id: "deck-a",
    kind: "paste",
    r2_key: "materials/deck-a/mat-a.txt",
    filename: "notes.txt",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("POST /api/jobs/:id/dismiss", () => {
  it("marks a failed job done and returns deck_id", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
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
      env.getGenerationJobs().find((j) => j.id === "job-fail")?.status,
    ).toBe("done");
  });

  it("rejects dismissing a running job", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
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
    const env = createTestEnv();
    seedOwner(env);
    env.seedGenerationJob({
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
    const job = env.getGenerationJobs().find((j) => j.id === "job-race");
    expect(job).toBeTruthy();
    // First request succeeds; second concurrent-style claim: flip to queued
    // then attempt dismiss after a "stale" failed read is not how HTTP works,
    // so flip before dismiss to assert the WHERE status clause.
    env.seedGenerationJob({
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
      env.getGenerationJobs().find((j) => j.id === "job-race")?.status,
    ).toBe("queued");
  });
});
