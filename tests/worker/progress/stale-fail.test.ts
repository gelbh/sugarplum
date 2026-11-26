import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../../../worker/db/client";
import {
  getExtractSidecar,
  putExtractSidecar,
} from "../../../worker/generation/extractSidecar";
import { RUNNING_JOB_STALE_MS } from "../../../worker/generation/progress";
import {
  STALE_RUNNING_FAIL_ERROR,
  failRunningJobIfStale,
  failStaleRunningJobs,
} from "../../../worker/generation/staleFail";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedDraftCard(
  env: Bindings,
  jobId: string,
  cardId = "card-1",
) {
  await seedCard(env, {
    id: cardId,
    deck_id: "d1",
    job_id: jobId,
    type: "qa",
    front_json: '"front"',
    back_json: '"back"',
    media_r2_keys_json: null,
    provenance_json: "{}",
    status: "draft",
    reject_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
}

async function seedJobGraph(env: Bindings) {
  await seedUser(env, {
    id: "u1",
    email: "u@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "d1",
    user_id: "u1",
    title: "Deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedMaterial(env, {
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
  it("fails a stale running job with no cards and sets finished_at", async () => {
    const env = cfEnv;
    await seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    await seedGenerationJob(env, {
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

    await putExtractSidecar(env, "job-stale", {
      text: "stale extract",
      windowResume: null,
      drafts: [],
    });

    const n = await failStaleRunningJobs(env);
    expect(n).toBe(1);
    const row = (await getGenerationJobs(env)).find((j) => j.id === "job-stale");
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe(STALE_RUNNING_FAIL_ERROR);
    expect(row?.finished_at).toBeTruthy();
    expect(await getExtractSidecar(env, "job-stale")).toBeNull();
  });

  it("preserves coverage_json when failing a stale job with no cards", async () => {
    const env = cfEnv;
    await seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    const coverage = JSON.stringify({
      covered: [],
      gaps: [],
      draft_count: 0,
      window_resume: { start_page: 10 },
    });
    await seedGenerationJob(env, {
      id: "job-cov",
      material_id: "m1",
      status: "running",
      error: null,
      coverage_json: coverage,
      progress_json: JSON.stringify({ updated_at: staleAt }),
      created_at: "2026-11-10T14:00:00.000Z",
      finished_at: null,
    });

    const n = await failStaleRunningJobs(env);
    expect(n).toBe(1);
    const row = (await getGenerationJobs(env)).find((j) => j.id === "job-cov");
    expect(row?.status).toBe("failed");
    expect(row?.coverage_json).toBe(coverage);
  });

  it("soft-completes a stale running job that already has draft cards", async () => {
    const env = cfEnv;
    await seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    await seedGenerationJob(env, {
      id: "job-drafts",
      material_id: "m1",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({
        updated_at: staleAt,
        stage: "persist",
        percent: 100,
      }),
      created_at: "2026-11-10T14:46:46.350Z",
      finished_at: null,
    });
    await seedDraftCard(env, "job-drafts");
    await putExtractSidecar(env, "job-drafts", {
      text: "draft extract",
      windowResume: null,
      drafts: [],
    });

    const n = await failStaleRunningJobs(env);
    expect(n).toBe(1);
    const row = (await getGenerationJobs(env)).find((j) => j.id === "job-drafts");
    expect(row?.status).toBe("needs_review");
    expect(row?.error).toBeNull();
    expect(row?.finished_at).toBeTruthy();
    expect(JSON.parse(row?.coverage_json ?? "{}")).toEqual({
      covered: [],
      gaps: [],
      draft_count: 1,
    });
    expect(await getExtractSidecar(env, "job-drafts")).toBeNull();
  });

  it("leaves a fresh running job alone", async () => {
    const env = cfEnv;
    await seedJobGraph(env);
    const freshAt = new Date().toISOString();
    await seedGenerationJob(env, {
      id: "job-fresh",
      material_id: "m1",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: JSON.stringify({ updated_at: freshAt }),
      created_at: freshAt,
      finished_at: null,
    });

    const n = await failStaleRunningJobs(env);
    expect(n).toBe(0);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-fresh")?.status,
    ).toBe("running");
  });

  it("CAS no-op when status is no longer running", async () => {
    const env = cfEnv;
    await seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    await seedGenerationJob(env, {
      id: "job-done",
      material_id: "m1",
      status: "needs_review",
      error: null,
      coverage_json: "{}",
      progress_json: JSON.stringify({ updated_at: staleAt }),
      created_at: staleAt,
      finished_at: staleAt,
    });

    const n = await failStaleRunningJobs(env, { jobId: "job-done" });
    expect(n).toBe(0);
  });

  it("CAS no-op when reclaim refreshed progress_json after the stale SELECT", async () => {
    const env = cfEnv;
    await seedJobGraph(env);
    const staleAt = new Date(
      Date.now() - RUNNING_JOB_STALE_MS - 1000,
    ).toISOString();
    const staleProgress = JSON.stringify({
      updated_at: staleAt,
      stage: "critique",
      percent: 77.5,
    });
    await seedGenerationJob(env, {
      id: "job-race",
      material_id: "m1",
      status: "running",
      error: null,
      coverage_json: null,
      progress_json: staleProgress,
      created_at: "2026-10-27T15:02:40.280Z",
      finished_at: null,
    });

    const db = getDb(env);
    const staleSnapshot = {
      id: "job-race",
      progress_json: staleProgress,
      created_at: "2026-10-27T15:02:40.280Z",
    };

    // Reclaim wins: refresh heartbeat while still running.
    const freshProgress = JSON.stringify({
      updated_at: new Date().toISOString(),
      stage: "critique",
      percent: 77.5,
    });
    await db
      .prepare(
        `UPDATE generation_jobs SET progress_json = ? WHERE id = ? AND status = ? AND progress_json = ?`,
      )
      .bind(freshProgress, "job-race", "running", staleProgress)
      .run();

    await putExtractSidecar(env, "job-race", {
      text: "race extract",
      windowResume: null,
      drafts: [],
    });

    const failed = await failRunningJobIfStale(env, staleSnapshot);
    expect(failed).toBe(false);
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-race")?.status,
    ).toBe("running");
    expect(
      (await getGenerationJobs(env)).find((j) => j.id === "job-race")?.progress_json,
    ).toBe(freshProgress);
    expect(await getExtractSidecar(env, "job-race")).not.toBeNull();
  });
});
