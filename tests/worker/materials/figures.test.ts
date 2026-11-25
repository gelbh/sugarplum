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
  seedR2,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
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
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("PDF figure crop materials", () => {
  it("presigns a figure crop to R2 without creating a materials row", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedMaterial(env, {
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/pdf-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/pdf-1/figures/presign",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "crop.png",
          contentType: "image/png",
          size: 1024,
          index: 2,
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      materialId?: string;
      uploadUrl: string;
      r2Key: string;
    };
    expect(body.materialId).toBeUndefined();
    expect(body.r2Key).toBe("materials/deck-a/figures/pdf-1/2.png");
    expect(body.uploadUrl).toContain("X-Amz-Signature=");
    expect((await getMaterials(env))).toHaveLength(1);
    expect((await getMaterials(env))[0]?.id).toBe("pdf-1");
  });

  it("completes a legacy figure child without enqueueing a generation job", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedMaterial(env, {
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/figure-1/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
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

  it("skips free-path generation for an unrelated image upload", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedMaterial(env, {
      id: "image-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/image-1.png",
      filename: "image.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, 
      "materials/deck-a/image-1.png",
      new Uint8Array([137, 80, 78, 71]),
    );

    const res = await app.request(
      "/api/materials/image-1/complete",
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
    });
    expect((await getGenerationJobs(env))).toHaveLength(0);
    expect(getQueueMessages()).toHaveLength(0);
  });

  it("returns 404 when another user tries to presign figures", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    await seedMaterial(env, {
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/pdf-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/pdf-1/figures/presign",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({
          filename: "crop.png",
          contentType: "image/png",
          size: 1024,
          index: 0,
        }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when the parent material is not a PDF", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    await seedMaterial(env, {
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/paste-1/figures/presign",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "crop.png",
          contentType: "image/png",
          size: 1024,
          index: 0,
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });
});
