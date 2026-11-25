import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getR2,
  getR2Keys,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSession,
  seedSubject,
  seedUser,
  withTestBindings,
} from "../../harness";
import { describe, it, expect, afterEach, vi } from "vitest";
import { app } from "../../../../worker/index";
import { SESSION_COOKIE } from "../../../../worker/auth/session";
import {
  applySandboxKeyPrefix,
  deleteSandboxR2Prefix,
} from "../../../../worker/admin/sandbox-r2";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const ADMIN_EMAIL = "ops@example.com";
const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};
const NOW = "2026-01-01T12:00:00.000Z";
const SOURCE_R2 = "materials/deck-a/mat-1.pdf";

async function seedAdminAndLearnerWithLibrary(env: Bindings) {
  await seedUser(env, {
    id: "admin-u",
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2025-01-01T00:00:00.000Z",
  });
  await seedUser(env, {
    id: "u-alice",
    email: "alice@example.com",
    password_hash: null,
    oauth_subject: "google-alice",
    created_at: "2026-10-28T00:00:00.000Z",
  });
  await seedSession(env, "s-admin", "admin-u");
  await seedSubject(env, {
    id: "subj-a",
    user_id: "u-alice",
    title: "Anatomy",
    created_at: NOW,
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "u-alice",
    title: "Spine",
    subject_hint: null,
    subject_id: "subj-a",
    created_at: NOW,
  });
  await seedMaterial(env, {
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
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedR2(env, SOURCE_R2, "source-bytes");
    await seedR2(env, "sandbox/sb-1/materials/x.txt", "sandbox-bytes");
    await seedR2(env, "sandbox/other/materials/y.txt", "other-bytes");

    const deleted = await deleteSandboxR2Prefix(env.MATERIALS, "sb-1");
    expect(deleted).toBe(1);
    expect(await getR2(env, SOURCE_R2)).toBe("source-bytes");
    expect(await getR2(env, "sandbox/sb-1/materials/x.txt")).toBeUndefined();
    expect(await getR2(env, "sandbox/other/materials/y.txt")).toBe("other-bytes");
  });
});

describe("admin view-as R2", () => {
  it("paste while view-as is 403 and leaves source R2 untouched", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearnerWithLibrary(env);
    await seedR2(env, SOURCE_R2, "pdf-bytes");

    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const paste = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ text: "note body", filename: "n.txt" }),
      },
      env,
    );
    expect(paste.status).toBe(403);
    expect(await getR2(env, SOURCE_R2)).toBe("pdf-bytes");
    expect((await getR2Keys(env)).filter((k) => k.startsWith("sandbox/"))).toEqual([]);
  });

  it("GET media for source material returns 200; Exit keeps source", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: ADMIN_EMAIL });
    await seedAdminAndLearnerWithLibrary(env);
    await seedR2(env, SOURCE_R2, "pdf-bytes");

    await app.request(
      "/api/admin/users/u-alice/impersonate",
      { method: "POST", headers: adminHeaders },
      env,
    );

    const dl = await app.request(
      "/api/materials/mat-1/download",
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
    expect(await getR2(env, SOURCE_R2)).toBe("pdf-bytes");
  });
});
