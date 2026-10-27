import { describe, expect, it } from "vitest";
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
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("PDF figure crop materials", () => {
  it("presigns a figure crop and creates an uploading child material", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
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
      materialId: string;
      uploadUrl: string;
      r2Key: string;
    };
    expect(body.materialId).toBeTruthy();
    expect(body.r2Key).toBe("materials/deck-a/figures/pdf-1/2.png");
    expect(body.uploadUrl).toContain("X-Amz-Signature=");
    expect(env.getMaterials()).toHaveLength(2);
    expect(env.getMaterials()[1]).toMatchObject({
      id: body.materialId,
      kind: "image",
      status: "uploading",
      r2_key: body.r2Key,
    });
  });

  it("completes a figure child without enqueueing a generation job", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
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
    expect(env.getGenerationJobs()).toHaveLength(0);
    expect(env.getQueueMessages()).toHaveLength(0);
  });

  it("still enqueues generation for an unrelated image upload", async () => {
    const env = createTestEnv();
    seedOwner(env);
    env.seedMaterial({
      id: "image-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/image-1.png",
      filename: "image.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/image-1/complete",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { jobId: string | null }).toMatchObject({
      jobId: expect.any(String),
    });
    expect(env.getGenerationJobs()).toHaveLength(1);
    expect(env.getQueueMessages()).toHaveLength(1);
  });
});
