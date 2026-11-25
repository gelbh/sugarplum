import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getExportJobs,
  getMaterials,
  getR2Keys,
  getUserSecrets,
  resetTestDb,
  seedCard,
  seedExportJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
  seedUserSecret,
  withTestBindings,
  seedAdminMonitorFixture,
} from "../harness";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { hashPassword } from "../../../worker/auth/password";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


describe("disabled_at auth enforcement", () => {
  it("401 on /api/auth/me for disabled user with valid session", async () => {
    const env = cfEnv;
    await seedUser(env, {
      id: "u-disabled",
      email: "disabled@example.com",
      password_hash: null,
      oauth_subject: "google-disabled",
      created_at: "2026-01-01T00:00:00.000Z",
      disabled_at: "2026-10-29T09:00:00.000Z",
    });
    await seedSession(env, "s-disabled", "u-disabled");
    const res = await app.request(
      "/api/auth/me",
      { headers: { cookie: `${SESSION_COOKIE}=s-disabled` } },
      env,
    );
    expect(res.status).toBe(401);
    const kv = await env.SESSIONS.get("s-disabled");
    expect(kv).toBeNull();
  });

  it("login as disabled returns 401 without minting a session", async () => {
    const env = cfEnv;
    const password = "long-enough-password";
    await seedUser(env, {
      id: "u-disabled-pw",
      email: "disabled-pw@example.com",
      password_hash: await hashPassword(password),
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
      disabled_at: "2026-10-29T09:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (
          String(input) ===
          "https://challenges.cloudflare.com/turnstile/v0/siteverify"
        ) {
          return new Response(
            JSON.stringify({ success: true, action: "login" }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "disabled-pw@example.com",
          password,
          turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/invalid email or password/i);
    expect(res.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE}=`,
    );
  });

  it("admin list includes disabled_at when set", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-bob",
      email: "bob@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-10-25T00:00:00.000Z",
      disabled_at: "2026-10-29T11:00:00.000Z",
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { email: string; disabled_at: string | null }[];
    };
    const bob = body.users.find((u) => u.email === "bob@example.com");
    expect(bob?.disabled_at).toBe("2026-10-29T11:00:00.000Z");
    const alice = body.users.find((u) => u.email === "alice@example.com");
    expect(alice?.disabled_at).toBeNull();
  });
});

const adminHeaders = {
  cookie: `${SESSION_COOKIE}=s-admin`,
  "content-type": "application/json",
};


describe("POST /api/admin/users/:id/disable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("400 when target email is allowlisted", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/admin-u/disable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(400);
    const detail = await app.request(
      "/api/admin/users/admin-u",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    const body = (await detail.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBeNull();
  });

  it("sets disabled_at for non-allowlisted user", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/u-alice/disable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(200);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    const body = (await detail.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBe("2026-10-29T12:00:00.000Z");
  });

  it("404 when user missing", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/missing/disable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(404);
  });
});


describe("POST /api/admin/users/:id/enable", () => {
  it("clears disabled_at", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-alice",
      email: "alice@example.com",
      password_hash: null,
      oauth_subject: "google-alice",
      created_at: "2026-10-28T00:00:00.000Z",
      disabled_at: "2026-10-29T10:00:00.000Z",
    });
    const res = await app.request(
      "/api/admin/users/u-alice/enable",
      { method: "POST", headers: adminHeaders },
      env,
    );
    expect(res.status).toBe(200);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    const body = (await detail.json()) as { disabled_at: string | null };
    expect(body.disabled_at).toBeNull();
  });
});


describe("POST /api/admin/users/:id/wipe", () => {
  async function seedWipeTarget(env: Bindings) {
    await seedAdminMonitorFixture(env);
    await seedMaterial(env, {
      id: "mat-alice",
      deck_id: "deck-alice",
      kind: "paste",
      r2_key: "materials/deck-alice/mat-alice.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-10-28T01:00:00.000Z",
    });
    await seedCard(env, {
      id: "card-a1",
      deck_id: "deck-alice",
      job_id: "job-alice",
      type: "qa",
      front_json: '{"q":"front"}',
      back_json: '{"a":"back"}',
      media_r2_keys_json: '["materials/deck-alice/fig-1.png"]',
      provenance_json: null,
      status: "accepted",
      created_at: "2026-10-28T02:10:00.000Z",
      updated_at: "2026-10-28T02:10:00.000Z",
    });
    await seedExportJob(env, {
      id: "export-alice",
      user_id: "u-alice",
      status: "ready",
      request_json: "{}",
      r2_key: "exports/u-alice/export-alice.apkg",
      error: null,
      warning_json: null,
      created_at: "2026-10-28T03:00:00.000Z",
      updated_at: "2026-10-28T03:00:00.000Z",
      expires_at: "2026-10-30T03:00:00.000Z",
    });
    await seedUserSecret(env, {
      user_id: "u-alice",
      provider: "openai",
      ciphertext: "secret-cipher",
      created_at: "2026-10-28T00:00:00.000Z",
      updated_at: "2026-10-28T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-alice-pdf",
      deck_id: "deck-alice",
      kind: "pdf",
      r2_key: "materials/deck-alice/mat-alice.pdf",
      filename: "lecture.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-10-28T01:05:00.000Z",
    });
    await seedR2(env, "materials/deck-alice/mat-alice.txt", "paste body");
    await seedR2(env, "materials/deck-alice/mat-alice.pdf", "pdf-bytes");
    await seedR2(env, "materials/deck-alice/fig-1.png", "png-bytes");
    await seedR2(env, "materials/deck-alice/figures/mat-alice-pdf/0.png", "crop");
    await seedR2(env, "exports/u-alice/export-alice.apkg", "apkg-bytes");
  }

  it("400 when confirmEmail mismatches; user remains", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedWipeTarget(env);
    const res = await app.request(
      "/api/admin/users/u-alice/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "wrong@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(detail.status).toBe(200);
    expect((await getCards(env)).some((c) => c.deck_id === "deck-alice")).toBe(true);
    expect((await getR2Keys(env))).toContain("materials/deck-alice/mat-alice.txt");
  });

  it("400 when wipe target is allowlisted", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/admin-u/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "ops@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("deletes user CASCADE and best-effort R2 keys on confirm", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedWipeTarget(env);
    const res = await app.request(
      "/api/admin/users/u-alice/wipe",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ confirmEmail: "ALICE@example.com" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const detail = await app.request(
      "/api/admin/users/u-alice",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(detail.status).toBe(404);
    expect((await getCards(env)).some((c) => c.deck_id === "deck-alice")).toBe(false);
    expect((await getMaterials(env)).some((m) => m.deck_id === "deck-alice")).toBe(
      false,
    );
    expect((await getUserSecrets(env)).some((s) => s.user_id === "u-alice")).toBe(
      false,
    );
    expect((await getExportJobs(env)).some((j) => j.user_id === "u-alice")).toBe(
      false,
    );
    expect((await getR2Keys(env))).not.toContain("materials/deck-alice/mat-alice.txt");
    expect((await getR2Keys(env))).not.toContain("materials/deck-alice/mat-alice.pdf");
    expect((await getR2Keys(env))).not.toContain("materials/deck-alice/fig-1.png");
    expect((await getR2Keys(env))).not.toContain(
      "materials/deck-alice/figures/mat-alice-pdf/0.png",
    );
    expect((await getR2Keys(env))).not.toContain("exports/u-alice/export-alice.apkg");
    expect((await getR2Keys(env))).toEqual([]);
  });
});


describe("GET /api/admin/users/:id/export", () => {
  it("includes card fronts and material text; omits secrets and password_hash", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    await seedUser(env, {
      id: "u-alice",
      email: "alice@example.com",
      password_hash: "should-never-export",
      oauth_subject: "google-alice",
      created_at: "2026-10-28T00:00:00.000Z",
    });
    await seedUserSecret(env, {
      user_id: "u-alice",
      provider: "openai",
      ciphertext: "secret-cipher",
      created_at: "2026-10-28T00:00:00.000Z",
      updated_at: "2026-10-28T00:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-alice",
      deck_id: "deck-alice",
      kind: "paste",
      r2_key: "materials/deck-alice/mat-alice.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-10-28T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "mat-pdf",
      deck_id: "deck-alice",
      kind: "pdf",
      r2_key: "materials/deck-alice/mat-pdf.pdf",
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-10-28T01:05:00.000Z",
    });
    await seedCard(env, {
      id: "card-a1",
      deck_id: "deck-alice",
      job_id: "job-alice",
      type: "qa",
      front_json: '{"q":"What is X?"}',
      back_json: '{"a":"Y"}',
      media_r2_keys_json: null,
      provenance_json: '{"src":1}',
      status: "accepted",
      created_at: "2026-10-28T02:10:00.000Z",
      updated_at: "2026-10-28T02:10:00.000Z",
    });
    await seedR2(env, "materials/deck-alice/mat-alice.txt", "hello paste body");
    await seedR2(env, "materials/deck-alice/mat-pdf.pdf", "%PDF-binary");

    const res = await app.request(
      "/api/admin/users/u-alice/export",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("should-never-export");
    expect(raw).not.toContain("secret-cipher");
    expect(raw).not.toContain("password_hash");
    expect(raw).not.toContain("user_secrets");
    const body = JSON.parse(raw) as {
      user: { id: string; email: string };
      cards: { id: string; front_json: string; back_json: string }[];
      materials: {
        id: string;
        kind: string;
        text?: string;
        r2_key?: string;
        filename?: string | null;
      }[];
    };
    expect(body.user).toMatchObject({
      id: "u-alice",
      email: "alice@example.com",
    });
    expect(body.cards.some((c) => c.front_json === '{"q":"What is X?"}')).toBe(
      true,
    );
    const paste = body.materials.find((m) => m.id === "mat-alice");
    expect(paste?.text).toBe("hello paste body");
    const pdf = body.materials.find((m) => m.id === "mat-pdf");
    expect(pdf).toMatchObject({
      kind: "pdf",
      r2_key: "materials/deck-alice/mat-pdf.pdf",
      filename: "slides.pdf",
      size: new TextEncoder().encode("%PDF-binary").byteLength,
    });
    expect(pdf).not.toHaveProperty("text");
    expect(Object.keys(body.user)).not.toContain("password_hash");
  });

  it("404 when user missing", async () => {
    const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
    await seedAdminMonitorFixture(env);
    const res = await app.request(
      "/api/admin/users/missing/export",
      { headers: { cookie: `${SESSION_COOKIE}=s-admin` } },
      env,
    );
    expect(res.status).toBe(404);
  });
});
