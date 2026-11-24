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

describe("focusRefreshLeaseActive", () => {
  const now = 1_700_000_000_000;
  const fp = "v2:abc";

  it("is active within TTL for timestamped leases", () => {
    expect(focusRefreshLeaseActive(`refreshing:${now}:${fp}`, now)).toBe(true);
    expect(
      focusRefreshLeaseActive(`refreshing:${now}:${fp}`, now + 119_999),
    ).toBe(true);
  });

  it("expires after TTL and rejects legacy untimed leases", () => {
    expect(
      focusRefreshLeaseActive(`refreshing:${now}:${fp}`, now + 120_000),
    ).toBe(false);
    expect(focusRefreshLeaseActive(`refreshing:${fp}`, now)).toBe(false);
    expect(focusRefreshLeaseActive(fp, now)).toBe(false);
    expect(focusRefreshLeaseActive(null, now)).toBe(false);
  });
});


describe("listEntriesWithFocus skipMutatingRefresh", () => {
  it("enriches without scheduling or rewriting fingerprint", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);
    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Intro to flukes",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
    });
    expect(paste.status).toBe(201);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        atlasId,
        "fasciola-hepatica",
        "standard",
        "Standard",
        "[]",
        null,
        "2026-01-01T00:00:00.000Z",
      )
      .run();
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind("stale-before-skip", atlasId)
      .run();

    let scheduled = false;
    const merged = overlayAtlas(loadParasiteDataset().entries, []);
    const result = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
      schedule: () => {
        scheduled = true;
      },
      skipMutatingRefresh: true,
    });
    expect(scheduled).toBe(false);
    expect(result.focusRefreshPending).toBe(false);
    expect(
      result.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("standard");
    const fp = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string | null }>();
    expect(fp?.focus_pack_fingerprint).toBe("stale-before-skip");
  });
});
