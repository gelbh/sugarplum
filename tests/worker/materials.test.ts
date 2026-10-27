import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

describe("deck materials ownership", () => {
  it("returns 404 when pasting into another user's deck", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
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
    env.seedSession("sess-b", "user-b");

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
    expect(env.getMaterials()).toHaveLength(0);
    expect(env.getR2Keys()).toHaveLength(0);
  });

  it("rejects paste over 100KB", async () => {
    const env = createTestEnv();
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
    const env = createTestEnv();
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
    expect(env.getMaterials()).toHaveLength(1);
    expect(env.getMaterials()[0]?.deck_id).toBe("deck-a");
    expect(env.getR2Keys().length).toBeGreaterThan(0);
  });
});

describe("PDF upload-url validation", () => {
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

  it("rejects non-PDF contentType with 400", async () => {
    const env = createTestEnv();
    seedOwner(env);

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
    expect(env.getMaterials()).toHaveLength(0);
  });

  it("rejects size over 25MB with 400", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const overLimit = 25 * 1024 * 1024 + 1;

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
    expect(env.getMaterials()).toHaveLength(0);
  });

  it("returns signed upload URL for valid PDF metadata", async () => {
    const env = createTestEnv();
    seedOwner(env);

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
    expect(env.getMaterials()).toHaveLength(1);
    expect(env.getMaterials()[0]?.kind).toBe("pdf");
    expect(env.getMaterials()[0]?.status).toBe("uploading");
  });

  it("returns signed upload URL for valid PPTX metadata", async () => {
    const env = createTestEnv();
    seedOwner(env);

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
    expect(env.getMaterials()[0]?.kind).toBe("pptx");
    expect(env.getMaterials()[0]?.status).toBe("uploading");
  });

  it("maps zip MIME + .pptx filename to pptx kind", async () => {
    const env = createTestEnv();
    seedOwner(env);

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
    expect(env.getMaterials()[0]?.kind).toBe("pptx");
    expect(env.getMaterials()[0]?.r2_key?.endsWith(".pptx")).toBe(true);
  });

  it("rejects image uploads over 8MB", async () => {
    const env = createTestEnv();
    seedOwner(env);

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
  function seedUploadingPdf(env: ReturnType<typeof createTestEnv>) {
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
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });
  }

  it("marks ready and queues a generation job for the owner", async () => {
    const env = createTestEnv();
    seedUploadingPdf(env);

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
    expect(env.getMaterials()[0]?.status).toBe("ready");
    expect(env.getGenerationJobs()).toHaveLength(1);
    expect(env.getGenerationJobs()[0]?.status).toBe("queued");
    expect(env.getGenerationJobs()[0]?.figure_extract_mode).toBe("fast");
    expect(env.getQueueMessages()).toHaveLength(1);
  });

  it("enqueues accurate figureExtractMode from JSON body", async () => {
    const env = createTestEnv();
    seedUploadingPdf(env);

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
    expect(env.getGenerationJobs()).toHaveLength(1);
    expect(env.getGenerationJobs()[0]?.figure_extract_mode).toBe("accurate");
    expect(env.getQueueMessages()).toHaveLength(1);
  });

  it("rejects unknown figureExtractMode with 400", async () => {
    const env = createTestEnv();
    seedUploadingPdf(env);

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
    expect(env.getGenerationJobs()).toHaveLength(0);
    expect(env.getMaterials()[0]?.status).toBe("uploading");
  });

  it("rejects non-object JSON roots with 400", async () => {
    const env = createTestEnv();
    seedUploadingPdf(env);

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
    expect(env.getGenerationJobs()).toHaveLength(0);
    expect(env.getMaterials()[0]?.status).toBe("uploading");
  });

  it("returns 200 for already-ready material even with invalid mode body", async () => {
    const env = createTestEnv();
    seedUploadingPdf(env);
    env.seedMaterial({
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
    expect(env.getGenerationJobs()).toHaveLength(0);
  });

  it("returns 404 when completing another user's material", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
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
    env.seedSession("sess-b", "user-b");
    env.seedMaterial({
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
    expect(env.getGenerationJobs()).toHaveLength(0);
  });
});

describe("decks list scoping", () => {
  it("lists only the current user's decks", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "A deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "B deck",
      subject_hint: null,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

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
