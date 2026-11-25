import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedSubject,
  seedUser,
  withTestBindings,
} from "../harness";
import { expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import type { AtlasEntryView } from "../../../src/atlas/types";
import type { Env } from "../../../worker/env";

export type TestEnv = Bindings;

export async function seedStudent(env: TestEnv) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
  await seedSubject(env, {
    id: "subj-1",
    user_id: "user-a",
    title: "Parasitology",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

export function headers(session: string, json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=${session}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export async function createAtlas(env: TestEnv): Promise<string> {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: headers("sess-a") },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

export function suggest(env: TestEnv, atlasId: string, entryId: string, body: unknown) {
  return app.request(
    `/api/atlas/${atlasId}/entries/${entryId}/suggestion`,
    { method: "POST", headers: headers("sess-a", true), body: JSON.stringify(body) },
    env,
  );
}

export async function patchOnly(env: TestEnv, atlasId: string, patch: Record<string, unknown>) {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries/psoroptes-ovis`,
    { method: "PATCH", headers: headers("sess-a", true), body: JSON.stringify(patch) },
    env,
  );
  expect(res.status).toBe(200);
}

export async function editAndSuggest(
  env: TestEnv,
  atlasId: string,
  patch: Record<string, unknown>,
  extra: { note?: string; sourceUrl?: string } = {},
) {
  await patchOnly(env, atlasId, patch);
  return suggest(env, atlasId, "psoroptes-ovis", { patch, ...extra });
}

export async function listEntries(env: TestEnv, atlasId: string): Promise<AtlasEntryView[]> {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries`,
    { headers: headers("sess-a") },
    env,
  );
  return ((await res.json()) as { entries: AtlasEntryView[] }).entries;
}

export async function studentSetup() {
  const env = withTestBindings(cfEnv, { adminEmails: "ops@example.com" });
  await seedStudent(env);
  const atlasId = await createAtlas(env);
  return { env, atlasId };
}

export async function seedAdmin(env: Env) {
  await seedUser(env, {
    id: "admin-u",
    email: "ops@example.com",
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-admin", "admin-u");
}

export function adminList(env: Env, query = "?status=open", session = "sess-admin") {
  return app.request(
    `/api/admin/atlas/corrections${query}`,
    { headers: headers(session) },
    env,
  );
}

export function adminResolve(env: Env, id: string, status: unknown, session = "sess-admin") {
  return app.request(
    `/api/admin/atlas/corrections/${id}`,
    { method: "POST", headers: headers(session, true), body: JSON.stringify({ status }) },
    env,
  );
}

export type AdminRow = {
  id: string;
  originKey: string;
  canonicalName: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  note: string | null;
  sourceUrl: string | null;
  studentEmail: string;
};

export async function openRows(env: Env): Promise<AdminRow[]> {
  const res = await adminList(env);
  expect(res.status).toBe(200);
  return ((await res.json()) as { corrections: AdminRow[] }).corrections;
}

export { cfEnv, resetTestDb };