import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getMaterials,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
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
