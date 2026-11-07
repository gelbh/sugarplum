import { describe, expect, it } from "vitest";
import { getDb } from "../../worker/db/client";
import { RUNNING_JOB_STALE_MS } from "../../worker/generation/progress";
import {
  STALE_RUNNING_FAIL_ERROR,
  failStaleRunningJobs,
} from "../../worker/generation/staleFail";
import { createTestEnv } from "./test-env";

function seedJobGraph(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "u1",
    email: "u@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "d1",
    user_id: "u1",
    title: "Deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedMaterial({
    id: "m1",
    deck_id: "d1",
    kind: "paste",
    r2_key: null,
    filename: null,
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

describe("failStaleRunningJobs", () => {
  it("fails a stale running job and sets finished_at", async () => {
    const env = createTestEnv();
    seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    env.seedGenerationJob({
      id: "job-stale",
      material_id: "m1",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({
        updated_at: staleAt,
        stage: "critique",
        percent: 77.5,
      }),
      created_at: "2026-10-27T15:02:40.280Z",
      finished_at: null,
    });

    const n = await failStaleRunningJobs(getDb(env));
    expect(n).toBe(1);
    const row = env.getGenerationJobs().find((j) => j.id === "job-stale");
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe(STALE_RUNNING_FAIL_ERROR);
    expect(row?.finished_at).toBeTruthy();
  });

  it("leaves a fresh running job alone", async () => {
    const env = createTestEnv();
    seedJobGraph(env);
    const freshAt = new Date().toISOString();
    env.seedGenerationJob({
      id: "job-fresh",
      material_id: "m1",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({ updated_at: freshAt }),
      created_at: freshAt,
      finished_at: null,
    });

    const n = await failStaleRunningJobs(getDb(env));
    expect(n).toBe(0);
    expect(
      env.getGenerationJobs().find((j) => j.id === "job-fresh")?.status,
    ).toBe("running");
  });

  it("CAS no-op when status is no longer running", async () => {
    const env = createTestEnv();
    seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    env.seedGenerationJob({
      id: "job-done",
      material_id: "m1",
      status: "needs_review",
      error: null,
      coverage_json: "{}",
      progress_json: JSON.stringify({ updated_at: staleAt }),
      created_at: staleAt,
      finished_at: staleAt,
    });

    const n = await failStaleRunningJobs(getDb(env), { jobId: "job-done" });
    expect(n).toBe(0);
  });
});
