import { expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { seedSession, seedSubject, seedUser } from "./seed";
import type { Bindings } from "./types";

export async function seedFocusOwner(env: Bindings): Promise<void> {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Parasitology",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

export function focusAuthHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export async function createFocusAtlas(env: Bindings): Promise<string> {
  const created = await app.request(
    "/api/atlas",
    { method: "POST", headers: focusAuthHeaders() },
    env,
  );
  expect(created.status).toBe(201);
  const atlas = (await created.json()) as { id: string };
  return atlas.id;
}

export async function pasteAtlasPack(
  env: Bindings,
  atlasId: string,
  opts: { text: string; filename: string; source_role?: string },
): Promise<Response> {
  return app.request(
    `/api/atlas/${atlasId}/materials/paste`,
    {
      method: "POST",
      headers: focusAuthHeaders(true),
      body: JSON.stringify(opts),
    },
    env,
  );
}
