import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  getMaterials,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedSession,
  seedUser,
  seedUserSecret,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("material complete", () => {
  async function seedUploadingPdf(env: Bindings) {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await env.MATERIALS.put("materials/deck-a/mat-1.pdf", "pdf-bytes");
  }

  it("marks ready and queues a generation job for the owner", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: string;
      jobId: string;
    };
    expect(body.id).toBe("mat-1");
    expect(body.status).toBe("ready");
    expect(body.jobId).toBeTruthy();
    expect((await getMaterials(env))[0]?.status).toBe("ready");
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect((await getGenerationJobs(env))[0]?.status).toBe("queued");
    expect((await getGenerationJobs(env))[0]?.figure_extract_mode).toBe("fast");
    expect(getQueueMessages()).toHaveLength(1);
  });

  it("enqueues accurate figureExtractMode from JSON body", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ figureExtractMode: "accurate" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await getGenerationJobs(env))).toHaveLength(1);
    expect((await getGenerationJobs(env))[0]?.figure_extract_mode).toBe("accurate");
    expect(getQueueMessages()).toHaveLength(1);
  });

  it("completes attachOnly uploads without enqueueing generation", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);
    await seedMaterial(env, {
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img.png",
      filename: "diagram.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await env.MATERIALS.put("materials/deck-a/mat-img.png", "img-bytes");

    const res = await app.request(
      "/api/materials/mat-img/complete",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ attachOnly: true }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { jobId: string | null }).toMatchObject({
      jobId: null,
    });
    expect((await getGenerationJobs(env))).toHaveLength(0);
    expect(getQueueMessages()).toHaveLength(0);
  });

  it("skips free-path image generate and returns manual_occlusion", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);
    await seedMaterial(env, {
      id: "mat-img-free",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img-free.png",
      filename: "diagram.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await env.MATERIALS.put("materials/deck-a/mat-img-free.png", "img-bytes");

    const res = await app.request(
      "/api/materials/mat-img-free/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      jobId: null,
      manual_occlusion: true,
      status: "ready",
    });
    expect((await getGenerationJobs(env))).toHaveLength(0);
    expect(getQueueMessages()).toHaveLength(0);
  });

  it("ready free-path image complete stays DIY (manual_occlusion)", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);
    await seedMaterial(env, {
      id: "mat-img-ready",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img-ready.png",
      filename: "diagram.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-02T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/mat-img-ready/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      jobId: null,
      manual_occlusion: true,
      status: "ready",
    });
    expect((await getGenerationJobs(env))).toHaveLength(0);
  });

  it("enqueues image generate when the owner has a BYO secret", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);
    await seedUserSecret(env, {
      user_id: "user-a",
      provider: "openai",
      ciphertext: "packed",
      model: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-img-byo",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img-byo.png",
      filename: "diagram.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await env.MATERIALS.put("materials/deck-a/mat-img-byo.png", "img-bytes");

    const res = await app.request(
      "/api/materials/mat-img-byo/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jobId: string | null;
      manual_occlusion?: boolean;
    };
    expect(body.jobId).toBeTruthy();
    expect(body.manual_occlusion).toBeUndefined();
    expect((await getGenerationJobs(env))).toHaveLength(1);
  });

  it("rejects unknown figureExtractMode with 400", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ figureExtractMode: "turbo" }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getGenerationJobs(env))).toHaveLength(0);
    expect((await getMaterials(env))[0]?.status).toBe("uploading");
  });

  it("rejects non-object JSON roots with 400", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body: "null",
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getGenerationJobs(env))).toHaveLength(0);
    expect((await getMaterials(env))[0]?.status).toBe("uploading");
  });

  it("returns 200 for already-ready material even with invalid mode body", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUploadingPdf(env);
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ figureExtractMode: "turbo" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobId: string | null; status: string };
    expect(body.status).toBe("ready");
    expect(body.jobId).toBeNull();
    expect((await getGenerationJobs(env))).toHaveLength(0);
  });

  it("returns 404 when completing another user's material", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedUser(env, {
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await getGenerationJobs(env))).toHaveLength(0);
  });
});
