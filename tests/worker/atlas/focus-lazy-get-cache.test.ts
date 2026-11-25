import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  createFocusAtlas,
  focusAuthHeaders,
  pasteAtlasPack,
  resetTestDb,
  seedAtlasMaterial,
  seedDeck,
  seedFocusOwner,
  seedMaterial,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import {
  enrichEntriesWithFocus,
  focusRefreshLeaseActive,
  listEntriesWithFocus,
  refreshAtlasFocus,
  setFocusOverride,
} from "../../../worker/atlas/focus";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import { overlayAtlas } from "../../../worker/atlas/merge";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import type { AtlasEntryView } from "../../../src/atlas/types";
import type { Env } from "../../../worker/env";

afterEach(async () => {
  await resetTestDb(cfEnv);
});


describe("atlas focus empty materials and lazy GET", () => {
  it("lazy-refreshes Focus on GET when cache is empty but ready pack materials exist", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    await seedAtlasMaterial(env, {
      id: "mat-pre",
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: `atlas/${atlasId}/mat-pre.pdf`,
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      content_hash: null,
      source_role: "tutorial",
    });

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("clears stale automatic Focus on GET when the pack is empty", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);
    const now = "2026-01-01T00:00:00.000Z";

    await env.DB.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "fasciola-hepatica",
        "key",
        'Named in lecture "old-deck.pdf"',
        '["deck-mat-1"]',
        null,
        now,
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "toxoplasma-gondii",
        "standard",
        "Standard",
        "[]",
        "key",
        now,
      )
      .run();

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: null,
      reason: null,
      override: null,
    });
    expect(
      body.entries.find((e) => e.id === "toxoplasma-gondii"),
    ).toMatchObject({
      tier: "key",
      reason: "Manual pin",
      override: "key",
    });
  });

  it("ignores non-ready pack materials during Focus refresh", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);
    await seedAtlasMaterial(env, {
      id: "mat-uploading",
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: `atlas/${atlasId}/mat-uploading.pdf`,
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
      content_hash: null,
      source_role: "tutorial",
    });

    const list = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { entries: AtlasEntryView[] };
    expect(
      body.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBeNull();
  });
});
