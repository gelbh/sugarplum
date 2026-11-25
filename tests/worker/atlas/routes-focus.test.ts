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

describe("atlas entry focus tiers", () => {
  it("returns null focus tiers when the subject has no materials", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.every((e) => e.tier === null && e.reason === null)).toBe(
      true,
    );
  });

  it("exposes Key tier after an atlas pack tutorial material is added", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const paste = await app.request(
      `/api/atlas/${atlasId}/materials/paste`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          text: "Intro to flukes",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    const fasciola = body.entries.find((e) => e.id === "fasciola-hepatica");
    expect(fasciola?.tier).toBe("key");
    expect(fasciola?.reason).toMatch(/tutorial/i);
    expect(
      body.entries.some((e) => e.id !== "fasciola-hepatica" && e.tier === "standard"),
    ).toBe(true);
  });

  it("lets a focus override pin win and clear restore the scan", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);

    const paste = await app.request(
      `/api/atlas/${atlasId}/materials/paste`,
      {
        method: "POST",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({
          text: "Intro to flukes",
          filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);

    const demote = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({ override: "standard" }),
      },
      env,
    );
    expect(demote.status).toBe(200);
    const demoted = (await demote.json()) as AtlasEntryView;
    expect(demoted.tier).toBe("standard");
    expect(demoted.reason).toBe("Manual demote");

    const clear = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({ override: null }),
      },
      env,
    );
    expect(clear.status).toBe(200);
    const restored = (await clear.json()) as AtlasEntryView;
    expect(restored.tier).toBe("key");
    expect(restored.reason).toMatch(/tutorial/i);
  });

  it("rescans when pack source_role is patched", async () => {
    const env = cfEnv;
    await seedAtlasRouteOwner(env);
    const { id: atlasId } = await createAtlasForRoutes(env);
    await seedAtlasMaterial(env, {
      id: "mat-1",
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: `atlas/${atlasId}/mat-1.pdf`,
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      content_hash: null,
      source_role: "lecture",
    });

    const before = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const beforeBody = (await before.json()) as { entries: AtlasEntryView[] };
    // Lazy GET backfills an empty Focus cache from ready pack materials.
    expect(
      beforeBody.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("standard");

    const patch = await app.request(
      "/api/atlas/materials/mat-1",
      {
        method: "PATCH",
        headers: atlasRouteAuthHeaders(true),
        body: JSON.stringify({ source_role: "tutorial" }),
      },
      env,
    );
    expect(patch.status).toBe(200);

    const after = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: atlasRouteAuthHeaders() },
      env,
    );
    const afterBody = (await after.json()) as { entries: AtlasEntryView[] };
    expect(
      afterBody.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("key");
  });

});
