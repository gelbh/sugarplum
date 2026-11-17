import { describe, it, expect, afterEach, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import {
  applySandboxKeyPrefix,
  deleteSandboxR2Prefix,
  sandboxR2Prefix,
} from "../../worker/admin/sandbox-r2";
import { writeOcrSidecar } from "../../worker/materials/ocr-sidecar";
import { createTestEnv } from "./test-env";

const ADMIN_EMAIL = "ops@example.com";
const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};
const NOW = "2026-01-01T12:00:00.000Z";
const SOURCE_R2 = "materials/deck-a/mat-1.pdf";

function seedAdminAndLearnerWithLibrary(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "admin-u",
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2025-01-01T00:00:00.000Z",
  });
  env.seedUser({
    id: "u-alice",
    email: "alice@example.com",
    password_hash: null,
    oauth_subject: "google-alice",
    created_at: "2026-10-28T00:00:00.000Z",
  });
  env.seedSession("s-admin", "admin-u");
  env.seedSubject({
    id: "subj-a",
    user_id: "u-alice",
    title: "Anatomy",
    created_at: NOW,
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "u-alice",
    title: "Spine",
    subject_hint: null,
    subject_id: "subj-a",
    created_at: NOW,
  });
  env.seedMaterial({
    id: "mat-1",
    deck_id: "deck-a",
    kind: "pdf",
    r2_key: SOURCE_R2,
    filename: "spine.pdf",
    page_count: 3,
    status: "ready",
    created_at: NOW,
    content_hash: "hash-1",
    source_role: "lecture",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sandbox R2 helpers", () => {
  it("applySandboxKeyPrefix prefixes once", () => {
    expect(applySandboxKeyPrefix(null, "materials/d/m.pdf")).toBe(
      "materials/d/m.pdf",
    );
    expect(applySandboxKeyPrefix("sb-1", "materials/d/m.pdf")).toBe(
      "sandbox/sb-1/materials/d/m.pdf",
    );
    expect(
      applySandboxKeyPrefix("sb-1", "sandbox/sb-1/materials/d/m.pdf"),
    ).toBe("sandbox/sb-1/materials/d/m.pdf");
  });

  it("deleteSandboxR2Prefix removes only the sandbox prefix", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    env.seedR2(SOURCE_R2, "source-bytes");
    env.seedR2("sandbox/sb-1/materials/x.txt", "sandbox-bytes");
    env.seedR2("sandbox/other/materials/y.txt", "other-bytes");

    const deleted = await deleteSandboxR2Prefix(env.MATERIALS, "sb-1");
    expect(deleted).toBe(1);
    expect(env.getR2(SOURCE_R2)).toBe("source-bytes");
    expect(env.getR2("sandbox/sb-1/materials/x.txt")).toBeUndefined();
    expect(env.getR2("sandbox/other/materials/y.txt")).toBe("other-bytes");
  });
});

describe("admin impersonation R2", () => {
  it("paste while impersonating lands under sandbox prefix and Exit cleans it", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    env.seedR2(SOURCE_R2, "pdf-bytes");

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const startBody = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = startBody.impersonation.sandboxUserId;
    const sandboxDeck = env.getDecks().find((d) => d.user_id === sandboxId)!;

    const paste = await app.request(
      `/api/decks/${sandboxDeck.id}/materials/paste`,
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ text: "sandbox note body", filename: "n.txt" }),
      },
      env,
    );
    expect(paste.status).toBe(201);
    const pasteBody = (await paste.json()) as { id: string; r2_key: string };
    expect(pasteBody.r2_key.startsWith(sandboxR2Prefix(sandboxId))).toBe(true);
    expect(env.getR2(pasteBody.r2_key)).toBe("sandbox note body");
    expect(env.getR2(SOURCE_R2)).toBe("pdf-bytes");

    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(exit.status).toBe(200);
    expect(env.getR2(pasteBody.r2_key)).toBeUndefined();
    expect(env.getR2(SOURCE_R2)).toBe("pdf-bytes");
    expect(env.getUsers().some((u) => u.id === sandboxId)).toBe(false);
  });

  it("OCR sidecar write under sandbox is prefixed and Exit cleans it", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    env.seedR2(SOURCE_R2, "pdf-bytes");

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const startBody = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = startBody.impersonation.sandboxUserId;
    const sandboxDeck = env.getDecks().find((d) => d.user_id === sandboxId)!;
    const sandboxMaterial = env
      .getMaterials()
      .find((m) => m.deck_id === sandboxDeck.id)!;

    await writeOcrSidecar(
      env,
      sandboxDeck.id,
      sandboxMaterial.id,
      [{ page: 1, text: "ocr" }],
      [],
    );
    const ocrKey = `${sandboxR2Prefix(sandboxId)}materials/${sandboxDeck.id}/ocr/${sandboxMaterial.id}.json`;
    expect(env.getR2(ocrKey)).toBeTruthy();

    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(exit.status).toBe(200);
    expect(env.getR2(ocrKey)).toBeUndefined();
    expect(env.getR2(SOURCE_R2)).toBe("pdf-bytes");
  });

  it("GET media for cloned material with source key returns 200; Exit keeps source", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdminAndLearnerWithLibrary(env);
    env.seedR2(SOURCE_R2, "pdf-bytes");

    const start = await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(start.status).toBe(200);
    const startBody = (await start.json()) as {
      impersonation: { sandboxUserId: string };
    };
    const sandboxId = startBody.impersonation.sandboxUserId;
    const sandboxDeck = env.getDecks().find((d) => d.user_id === sandboxId)!;
    const sandboxMaterial = env
      .getMaterials()
      .find((m) => m.deck_id === sandboxDeck.id && m.r2_key === SOURCE_R2)!;
    expect(sandboxMaterial.r2_key).toBe(SOURCE_R2);

    const dl = await app.request(
      `/api/materials/${sandboxMaterial.id}/download`,
      { method: "GET", headers: adminHeaders },
      env,
    );
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe("pdf-bytes");

    const exit = await app.request(
      "/api/admin/impersonation/exit",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(exit.status).toBe(200);
    expect(env.getR2(SOURCE_R2)).toBe("pdf-bytes");
  });
});
