import { env as cfEnv } from "cloudflare:workers";
import {
  getR2,
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  focusSidecarCacheHit,
  ocrSidecarKey,
} from "../../worker/materials/ocr-sidecar";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedReadyPdf() {
  const env = cfEnv;
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
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  return env;
}

describe("ocr refetch", () => {
  it("signs a GET for the owner including resume past page 120", async () => {
    const env = await seedReadyPdf();
    const res = await app.request(
      "/api/materials/mat-1/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      refill: boolean;
      downloadUrl?: string;
      expiresIn?: number;
    };
    expect(body.refill).toBe(true);
    expect(body.expiresIn).toBe(900);
    expect(body.downloadUrl).toContain("materials/deck-a/mat-1.pdf");
    expect(body.downloadUrl).toContain("X-Amz-Expires=900");

    await seedGenerationJob(env, {
      id: "job-far",
      material_id: "mat-1",
      status: "failed",
      error: null,
      coverage_json: JSON.stringify({
        window_resume: { used_keys: [], next_page: 121, total_pages: 200 },
      }),
      progress_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-02T00:00:00.000Z",
    });
    const resumed = await app.request(
      "/api/materials/mat-1/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(resumed.status).toBe(200);
    const resumedBody = (await resumed.json()) as {
      refill: boolean;
      downloadUrl?: string;
      expiresIn?: number;
      startPage?: number;
      windowEnd?: number;
    };
    expect(resumedBody.refill).toBe(true);
    expect(resumedBody.expiresIn).toBe(900);
    expect(resumedBody.startPage).toBe(121);
    expect(resumedBody.windowEnd).toBe(240);
    expect(resumedBody.downloadUrl).toContain("materials/deck-a/mat-1.pdf");
    expect(resumedBody.downloadUrl).toContain("X-Amz-Expires=900");
  });

  it("rejects a paste material", async () => {
    const env = await seedReadyPdf();
    await seedMaterial(env, {
      id: "mat-paste",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-paste.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await app.request(
      "/api/materials/mat-paste/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 for a stranger", async () => {
    const env = await seedReadyPdf();
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    const res = await app.request(
      "/api/materials/mat-1/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("appends a new page, keeps stored text, and marks unstudied behind the cursor", async () => {
    const env = await seedReadyPdf();
    await seedGenerationJob(env, {
      id: "job-resume-41",
      material_id: "mat-1",
      status: "failed",
      error: null,
      coverage_json: JSON.stringify({
        window_resume: { used_keys: [], next_page: 41, total_pages: 200 },
      }),
      progress_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-02T00:00:00.000Z",
    });
    await seedR2(env, 
      ocrSidecarKey("deck-a", "mat-1"),
      JSON.stringify({ pages: [{ page: 1, text: "first" }] }),
    );
    const pagesBody = {
      pages: [
        { page: 9, text: "later" },
        { page: 1, text: "overwrite" },
      ],
    };
    const res = await app.request(
      "/api/materials/mat-1/ocr-pages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify(pagesBody),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: 2 });
    const stored = await getR2(env, ocrSidecarKey("deck-a", "mat-1"));
    expect(typeof stored).toBe("string");
    const parsed = JSON.parse(stored as string) as {
      pages: { page: number; text: string }[];
      unstudiedPages?: number[];
    };
    expect(parsed.pages).toEqual([
      { page: 1, text: "first" },
      { page: 9, text: "later" },
    ]);
    expect(parsed.unstudiedPages).toEqual([9]);

    const beforeSecond = stored as string;
    const second = await app.request(
      "/api/materials/mat-1/ocr-pages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify(pagesBody),
      },
      env,
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ stored: 2 });
    expect(await getR2(env, ocrSidecarKey("deck-a", "mat-1"))).toBe(beforeSecond);
  });
});

describe("focusSidecarCacheHit", () => {
  it("hits when hash matches and a page has text", () => {
    expect(
      focusSidecarCacheHit(
        {
          pages: [{ page: 1, text: "Fasciola hepatica" }],
          sourceContentHash: "abc",
        },
        "abc",
      ),
    ).toBe(true);
  });

  it("misses when hash missing, mismatched, or all pages empty", () => {
    expect(
      focusSidecarCacheHit({ pages: [{ page: 1, text: "x" }] }, "abc"),
    ).toBe(false);
    expect(
      focusSidecarCacheHit(
        { pages: [{ page: 1, text: "x" }], sourceContentHash: "old" },
        "abc",
      ),
    ).toBe(false);
    expect(
      focusSidecarCacheHit(
        { pages: [{ page: 1, text: "  " }], sourceContentHash: "abc" },
        "abc",
      ),
    ).toBe(false);
  });
});
