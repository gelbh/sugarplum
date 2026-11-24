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

describe("atlas focus in_pack", () => {
  const ARTHROPOD_NOTES =
    "Sheep scab: Psoroptes ovis. Follicle mites: Demodex (canis, bovis).";

  async function packAtlas() {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);
    const paste = await pasteAtlasPack(env, atlasId, {
      text: ARTHROPOD_NOTES,
      filename: "PA13_mites.pdf",
      source_role: "lecture",
    });
    expect(paste.status).toBe(201);
    return { env, atlasId };
  }

  async function list(env: Bindings, atlasId: string) {
    return listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: overlayAtlas(loadParasiteDataset().entries, []),
    });
  }

  const inPackOf = (entries: AtlasEntryView[], id: string) =>
    entries.find((e) => e.id === id)?.inPack;

  async function storedInPack(
    env: Bindings,
    atlasId: string,
    entryKey: string,
  ) {
    const row = await env.DB.prepare(
      `SELECT entry_key, tier, reason, material_ids_json, override, in_pack
       FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
    )
      .bind(atlasId, entryKey)
      .first<{ in_pack: number; material_ids_json: string }>();
    return row;
  }

  it("writes in_pack and lenient material ids for lecture-only mentions", async () => {
    const { env, atlasId } = await packAtlas();
    const result = await list(env, atlasId);
    expect(result.focusRefreshPending).toBe(false);
    expect(inPackOf(result.entries, "psoroptes-ovis")).toBe(true);
    expect(inPackOf(result.entries, "demodex-canis")).toBe(true);
    expect(inPackOf(result.entries, "toxocara-canis")).toBe(false);
    const demodex = result.entries.find((e) => e.id === "demodex-canis");
    expect(demodex?.tier).toBe("standard");
    expect(demodex?.focusMaterialIds).toHaveLength(1);
    expect((await storedInPack(env, atlasId, "psoroptes-ovis"))?.in_pack).toBe(1);
    expect((await storedInPack(env, atlasId, "toxocara-canis"))?.in_pack).toBe(0);
  });

  it("rescans rows written under the previous fingerprint version", async () => {
    const { env, atlasId } = await packAtlas();
    await list(env, atlasId);
    const fp = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string }>();
    expect(fp?.focus_pack_fingerprint).toMatch(/^v5:/);
    // Simulate a pre-0041 row: old fingerprint version, in_pack defaulted to 0.
    await env.DB.prepare(
      `INSERT OR REPLACE INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(atlasId, "psoroptes-ovis", "standard", "Standard", "[]", null, "2026-01-01T00:00:00.000Z")
      .run();
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind(fp!.focus_pack_fingerprint.replace(/^v5:/, "v3:"), atlasId)
      .run();

    const result = await list(env, atlasId);
    expect(inPackOf(result.entries, "psoroptes-ovis")).toBe(true);
    expect((await storedInPack(env, atlasId, "psoroptes-ovis"))?.in_pack).toBe(1);
  });

  it("keeps in_pack when a pin is set and cleared", async () => {
    const { env, atlasId } = await packAtlas();
    await list(env, atlasId);
    await setFocusOverride(env.DB, atlasId, "psoroptes-ovis", "key");
    expect((await storedInPack(env, atlasId, "psoroptes-ovis"))?.in_pack).toBe(1);
    await setFocusOverride(env.DB, atlasId, "psoroptes-ovis", null);
    expect((await storedInPack(env, atlasId, "psoroptes-ovis"))?.in_pack).toBe(1);
  });

  it("reports inPack null on read-only view-as when rows are from an older scan", async () => {
    const { env, atlasId } = await packAtlas();
    await list(env, atlasId);
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind("v2:stale", atlasId)
      .run();
    const result = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: overlayAtlas(loadParasiteDataset().entries, []),
      skipMutatingRefresh: true,
    });
    expect(result.entries.every((e) => e.inPack === null)).toBe(true);
  });

  async function markStale(env: Bindings, atlasId: string) {
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind("v2:stale", atlasId)
      .run();
  }

  it("reports inPack null while a background rescan is scheduled or leased", async () => {
    const { env, atlasId } = await packAtlas();
    await list(env, atlasId);
    expect((await storedInPack(env, atlasId, "psoroptes-ovis"))?.in_pack).toBe(1);
    await markStale(env, atlasId);
    const entries = overlayAtlas(loadParasiteDataset().entries, []);

    let scheduled: Promise<unknown> | null = null;
    const first = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries,
      schedule: (p) => {
        scheduled = p;
      },
    });
    expect(scheduled).not.toBeNull();
    expect(first.focusRefreshPending).toBe(true);
    expect(first.entries.every((e) => e.inPack === null)).toBe(true);

    const leased = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries,
      schedule: () => {
        throw new Error("must not schedule again while leased");
      },
    });
    expect(leased.focusRefreshPending).toBe(true);
    expect(leased.entries.every((e) => e.inPack === null)).toBe(true);

    await scheduled!;
    const done = await list(env, atlasId);
    expect(inPackOf(done.entries, "psoroptes-ovis")).toBe(true);
  });

  it("reports inPack null from a single-entry route on a stale fingerprint", async () => {
    const { env, atlasId } = await packAtlas();
    await list(env, atlasId);
    await markStale(env, atlasId);
    const put = await app.request(
      `/api/atlas/${atlasId}/entries/psoroptes-ovis/note`,
      {
        method: "PUT",
        headers: focusAuthHeaders(true),
        body: JSON.stringify({ body: "Check the ear" }),
      },
      env,
    );
    expect(put.status).toBe(200);
    expect(((await put.json()) as AtlasEntryView).inPack).toBeNull();
  });

  it("reports inPack after a route refreshes a stale fingerprint inline", async () => {
    const { env, atlasId } = await packAtlas();
    await list(env, atlasId);
    await markStale(env, atlasId);
    const patch = await app.request(
      `/api/atlas/${atlasId}/entries/psoroptes-ovis/focus`,
      {
        method: "PATCH",
        headers: focusAuthHeaders(true),
        body: JSON.stringify({ override: "key" }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as AtlasEntryView).inPack).toBe(true);
  });

  it("enrich maps unscanned entries to inPack null", () => {
    const views = overlayAtlas(loadParasiteDataset().entries, []);
    expect(enrichEntriesWithFocus(views, null, true).every((e) => e.inPack === null)).toBe(true);
    expect(enrichEntriesWithFocus(views, new Map(), true).every((e) => e.inPack === null)).toBe(true);
  });
});
