import { env as cfEnv } from "cloudflare:workers";
import {
  getMaterials,
  getR2,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedSession,
  seedUser,
} from "../../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../../worker/index";
import { SESSION_COOKIE } from "../../../../worker/auth/session";
import { ocrSidecarKey } from "../../../../worker/materials/ocr-sidecar";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("complete upload sidecar", () => {
  it("stores ocr pages after the pdf is ready", async () => {
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
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await env.MATERIALS.put("materials/deck-a/mat-1.pdf", "pdf-bytes");

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          ocrPages: [{ page: 1, text: "scanned cecum" }],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect((await getMaterials(env))[0]?.status).toBe("ready");
    expect(await getR2(env, ocrSidecarKey("deck-a", "mat-1"))).toContain(
      "scanned cecum",
    );
  });
});
