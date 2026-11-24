import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  getMaterials,
  getQueueMessages,
  getR2Keys,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedSession,
  seedUser,
  seedUserSecret,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("deck materials ownership", () => {
  it("returns 404 when pasting into another user's deck", async () => {
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

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ text: "stolen notes" }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await getMaterials(env))).toHaveLength(0);
    expect((await getR2Keys(env))).toHaveLength(0);
  });

  it("rejects paste over 100KB", async () => {
    const env = installQueueRecorders(cfEnv);
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

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ text: "x".repeat(100 * 1024 + 1) }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("stores paste material for the deck owner", async () => {
    const env = installQueueRecorders(cfEnv);
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

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ text: "my notes", filename: "notes.txt" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      kind: string;
      status: string;
      filename: string | null;
    };
    expect(body.kind).toBe("paste");
    expect(body.status).toBe("ready");
    expect(body.filename).toBe("notes.txt");
    expect((await getMaterials(env))).toHaveLength(1);
    expect((await getMaterials(env))[0]?.deck_id).toBe("deck-a");
    expect((await getR2Keys(env)).length).toBeGreaterThan(0);
  });
});

describe("PDF upload-url validation", () => {
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

  it("rejects non-PDF contentType with 400", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "notes.txt",
          contentType: "text/plain",
          size: 1024,
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await getMaterials(env))).toHaveLength(0);
  });

  it("rejects size over 50MB with 400", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);
    const overLimit = 50 * 1024 * 1024 + 1;

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "huge.pdf",
          contentType: "application/pdf",
          size: overLimit,
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(
      String(body.detail ?? body.error ?? body.message ?? ""),
    ).toMatch(/50MB/i);
    expect((await getMaterials(env))).toHaveLength(0);
  });

  it("accepts size equal to 50MB for PDF upload-url", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "edge.pdf",
          contentType: "application/pdf",
          size: 50 * 1024 * 1024,
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
  });

  it("returns signed upload URL for valid PDF metadata", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "lecture.pdf",
          contentType: "application/pdf",
          size: 1024,
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
    expect(body.r2Key).toContain("materials/deck-a/");
    expect(body.r2Key.endsWith(".pdf")).toBe(true);
    expect(body.uploadUrl).toContain("X-Amz-Signature=");
    expect((await getMaterials(env))).toHaveLength(1);
    expect((await getMaterials(env))[0]?.kind).toBe("pdf");
    expect((await getMaterials(env))[0]?.status).toBe("uploading");
  });

  it("returns signed upload URL for valid PPTX metadata", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "lecture.pptx",
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          size: 2048,
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
    expect(body.r2Key.endsWith(".pptx")).toBe(true);
    expect((await getMaterials(env))[0]?.kind).toBe("pptx");
    expect((await getMaterials(env))[0]?.status).toBe("uploading");
  });

  it("maps zip MIME + .pptx filename to pptx kind", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "slides.pptx",
          contentType: "application/zip",
          size: 4096,
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await getMaterials(env))[0]?.kind).toBe("pptx");
    expect((await getMaterials(env))[0]?.r2_key?.endsWith(".pptx")).toBe(true);
  });

  it("rejects image uploads over 8MB", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "huge.png",
          contentType: "image/png",
          size: 9 * 1024 * 1024,
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });
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
    void env.MATERIALS.put("materials/deck-a/mat-1.pdf", "pdf-bytes");
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
    void env.MATERIALS.put("materials/deck-a/mat-img.png", "img-bytes");

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
    void env.MATERIALS.put("materials/deck-a/mat-img-free.png", "img-bytes");

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
    void env.MATERIALS.put("materials/deck-a/mat-img-byo.png", "img-bytes");

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

describe("decks list scoping", () => {
  it("lists only the current user's decks", async () => {
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
      title: "A deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "B deck",
      subject_hint: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");

    const res = await app.request(
      "/api/decks",
      {
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const decks = (await res.json()) as { id: string; title: string }[];
    expect(decks).toEqual([
      {
        id: "deck-a",
        title: "A deck",
        subject_hint: null,
        subject_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
