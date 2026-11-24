import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedSubject,
  seedUser,
  TEST_SECRETS_WRAP_KEY,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { encryptSecret } from "../../worker/crypto/secrets";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

function authHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function seedConnection(
  env: Bindings,
  scopes: string,
) {
  const refresh = await encryptSecret("refresh-test-token", TEST_SECRETS_WRAP_KEY);
  await env.DB.prepare(
    "INSERT INTO calendar_connections (user_id, refresh_ciphertext, scopes, updated_at) VALUES (?, ?, ?, ?)",
  )
    .bind("user-a", refresh, scopes, "2026-11-06T00:00:00.000Z")
    .run();
}

function stubCourseCalendar() {
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "ya29.test", expires_in: 3600 });
    }
    if (url.includes("/calendarList")) {
      return Response.json({
        items: [{ id: "course", selected: true }],
      });
    }
    if (url.includes("/events")) {
      return Response.json({
        items: [
          { summary: "Lecture: GEP AB2" },
          { summary: "Lecture: GEP AB2" },
        ],
      });
    }
    return originalFetch(input, init);
  };
}

describe("calendar routes", () => {
  it("rejects GET /api/calendar with no cookie", async () => {
    const env = cfEnv;
    const res = await app.request("/api/calendar", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns an empty status when the account has no connection", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const res = await app.request("/api/calendar", { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      connected: false,
      suggestions: false,
      gaps: false,
      reconnect: false,
    });
  });

  it("redirects connect to calendar scopes without openid", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const res = await app.request(
      "/api/calendar/connect",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("calendar.events.readonly");
    expect(location).toContain("calendar.freebusy");
    expect(location).toContain("calendar.calendarlist.readonly");
    expect(location).toContain("access_type=offline");
    expect(location).not.toContain("openid");
  });

  it("returns empty suggestions when there is no connection", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const res = await app.request(
      "/api/calendar/suggestions",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subjects: [], decksBySubjectId: {} });
  });

  it("links GEP AB2 and does not link Parasitology", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-para",
      user_id: "user-a",
      title: "Parasitology",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-gep",
      user_id: "user-a",
      title: "GEP AB2",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedConnection(
      env,
      "calendar.events.readonly calendar.calendarlist.readonly",
    );
    stubCourseCalendar();

    const res = await app.request(
      "/api/calendar/suggestions",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subjects: { clusterKey: string; title: string; linkSubjectId: string | null }[];
    };
    expect(body.subjects).toEqual([
      expect.objectContaining({
        clusterKey: "gepab2",
        title: "GEP AB2",
        evidence: "2 events",
        linkSubjectId: "sub-gep",
      }),
    ]);
    expect(body.subjects[0]?.linkSubjectId).not.toBe("sub-para");
  });

  it("omits a dismissed cluster", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-gep",
      user_id: "user-a",
      title: "GEP AB2",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedConnection(
      env,
      "calendar.events.readonly calendar.calendarlist.readonly",
    );
    stubCourseCalendar();

    const dismissed = await app.request(
      "/api/calendar/dismissals",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ clusterKey: "gepab2" }),
      },
      env,
    );
    expect(dismissed.status).toBe(200);

    const res = await app.request(
      "/api/calendar/suggestions",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subjects: { clusterKey: string }[] };
    expect(body.subjects.map((row) => row.clusterKey)).not.toContain("gepab2");
  });

  it("disconnects and keeps the subject", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-gep",
      user_id: "user-a",
      title: "GEP AB2",
      created_at: "2026-01-02T00:00:00.000Z",
    });
    await seedConnection(
      env,
      "calendar.events.readonly calendar.calendarlist.readonly",
    );

    const removed = await app.request(
      "/api/calendar",
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(removed.status).toBe(200);

    const status = await app.request(
      "/api/calendar",
      { headers: authHeaders() },
      env,
    );
    expect(await status.json()).toEqual({
      connected: false,
      suggestions: false,
      gaps: false,
      reconnect: false,
    });

    const subjects = await env.DB.prepare(
      "SELECT id, title FROM subjects WHERE user_id = ?",
    )
      .bind("user-a")
      .all<{ id: string; title: string }>();
    expect(subjects.results).toEqual([
      { id: "sub-gep", title: "GEP AB2" },
    ]);
  });
});
