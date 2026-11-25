import { expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { seedDeck, seedSession, seedSubject, seedUser } from "./seed";
import type { Bindings } from "./types";

export async function seedAtlasRouteOwner(env: Bindings): Promise<void> {
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

export function atlasRouteAuthHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export async function createAtlasForRoutes(env: Bindings) {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: atlasRouteAuthHeaders() },
    env,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as {
    id: string;
    userId: string;
    templateKey: string;
    createdAt: string;
  };
}

export { seedDeck };