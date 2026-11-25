import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb, seedSession, seedUser, seedAtlasMaterial } from "../harness";
import {
  atlasRouteAuthHeaders,
  createAtlasForRoutes,
  seedAtlasRouteOwner,
  seedDeck,
} from "../harness/atlas-routes";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { AtlasEntryView } from "../../../src/atlas/types";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("atlas access and listing", () => {
  it("returns 401 for unauthenticated create", async () => {
    const env = cfEnv;
    const res = await app.request(
      "/api/atlas",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-owner atlas access", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");

    const res = await app.request(
      `/api/atlas/${atlasId}`,
      {
        headers: { cookie: `${SESSION_COOKIE}=sess-b` },
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("creates an empty atlas and lists merged dataset entries", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);

    const created = await createAtlasForRoutes(env);
    const atlasId = created.id;
    expect(created).toMatchObject({
      userId: "user-a",
      templateKey: "parasite",
    });
    expect(created.id).toBeTruthy();

    const again = await app.request(
      "/api/atlas",
      { method: "POST", headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: created.id });

    const meta = await app.request(
      `/api/atlas/${atlasId}`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(meta.status).toBe(200);
    expect(await meta.json()).toMatchObject({
      id: created.id,
      userId: "user-a",
      templateKey: "parasite",
    });

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const dataset = loadParasiteDataset();
    expect(body.entries).toHaveLength(dataset.entries.length);
    expect(body.entries.some((e) => e.id === "fasciola-hepatica")).toBe(true);
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica")?.editedAt,
    ).toBeNull();
  });

  it("returns 404 for entries when atlas is missing", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const atlasId = "missing-atlas";
    const res = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(res.status).toBe(404);
  });

});
