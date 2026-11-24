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
  it("keeps override rows when scannable materials become empty", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Intro",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
    });
    expect(paste.status).toBe(201);
    const material = (await paste.json()) as { id: string };

    const pin = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: focusAuthHeaders(true),
        body: JSON.stringify({ override: "key" }),
      },
      env,
    );
    expect(pin.status).toBe(200);

    const del = await app.request(
      `/api/atlas/materials/${material.id}`,
      {
        method: "DELETE",
        headers: focusAuthHeaders(),
      },
      env,
    );
    expect(del.status).toBe(204);

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
      reason: "Manual pin",
      override: "key",
    });

    const demote = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: focusAuthHeaders(true),
        body: JSON.stringify({ override: "standard" }),
      },
      env,
    );
    expect(demote.status).toBe(200);
    expect(await demote.json()).toMatchObject({
      tier: "standard",
      reason: "Manual demote",
      override: "standard",
    });
  });

  it("rejects a null JSON body on focus PATCH", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const res = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/focus`,
      {
        method: "PATCH",
        headers: focusAuthHeaders(true),
        body: "null",
      },
      env,
    );
    expect(res.status).toBe(400);
  });

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

  it("schedules pack Focus refresh when schedule is provided", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica named late in the handout.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    const warm = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(warm.status).toBe(200);

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
      .bind(null, atlasId)
      .run();

    const merged = overlayAtlas(loadParasiteDataset().entries, []);
    let scheduled: Promise<unknown> | null = null;
    const first = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
      schedule: (p) => {
        scheduled = p;
      },
    });
    expect(first.focusRefreshPending).toBe(true);
    expect(first.entries.find((e) => e.id === "fasciola-hepatica")?.tier).toBe(
      "standard",
    );
    const lease = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string | null }>();
    expect(lease?.focus_pack_fingerprint).toMatch(/^refreshing:\d+:/);
    expect(scheduled).not.toBeNull();

    const mid = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
      schedule: () => {
        throw new Error("must not schedule again while leased");
      },
    });
    expect(mid.focusRefreshPending).toBe(true);

    await scheduled!;

    const second = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
    });
    expect(second.focusRefreshPending).toBe(false);
    expect(
      second.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("retries pack Focus refresh when refreshing lease is legacy untimed", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica named late in the handout.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );

    const current = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string | null }>();
    expect(current?.focus_pack_fingerprint?.startsWith("v5:")).toBe(true);

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

    // Legacy stuck lease (no timestamp) must not block forever.
    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind(`refreshing:${current!.focus_pack_fingerprint}`, atlasId)
      .run();

    const merged = overlayAtlas(loadParasiteDataset().entries, []);
    let scheduled: Promise<unknown> | null = null;
    const retry = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
      schedule: (p) => {
        scheduled = p;
      },
    });
    expect(retry.focusRefreshPending).toBe(true);
    expect(scheduled).not.toBeNull();
    await scheduled!;

    const healed = await listEntriesWithFocus(env.DB, env, {
      atlasId,
      userId: "user-a",
      entries: merged,
    });
    expect(healed.focusRefreshPending).toBe(false);
    expect(
      healed.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("rescans complete Focus map when pack fingerprint is missing or stale", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    const atlasId = await createFocusAtlas(env);

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica named late in the handout.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    const warm = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(warm.status).toBe(200);
    const warmBody = (await warm.json()) as { entries: AtlasEntryView[] };
    expect(
      warmBody.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({ tier: "key" });

    const fpRow = await env.DB.prepare(
      "SELECT focus_pack_fingerprint FROM atlases WHERE id = ?",
    )
      .bind(atlasId)
      .first<{ focus_pack_fingerprint: string | null }>();
    expect(fpRow?.focus_pack_fingerprint).toMatch(/^v5:/);

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

    const matchedFp = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(matchedFp.status).toBe(200);
    const matchedBody = (await matchedFp.json()) as {
      entries: AtlasEntryView[];
    };
    expect(
      matchedBody.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBe("standard");

    await env.DB.prepare(
      "UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?",
    )
      .bind(null, atlasId)
      .run();

    const healed = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(healed.status).toBe(200);
    const healedBody = (await healed.json()) as { entries: AtlasEntryView[] };
    expect(
      healedBody.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });

  it("deck-only ready materials do not Key; atlas pack paste can", async () => {
    const env = cfEnv;
    await seedFocusOwner(env);
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Parasitology deck",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const atlasId = await createFocusAtlas(env);

    await seedMaterial(env, {
      id: "deck-mat",
      deck_id: "deck-1",
      kind: "pdf",
      r2_key: "materials/deck-1/deck-mat.pdf",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "tutorial",
    });

    const listDeckOnly = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(listDeckOnly.status).toBe(200);
    const deckOnly = (await listDeckOnly.json()) as {
      entries: AtlasEntryView[];
    };
    expect(
      deckOnly.entries.find((e) => e.id === "fasciola-hepatica")?.tier,
    ).toBeNull();

    const paste = await pasteAtlasPack(env, atlasId, {
      text: "Fasciola hepatica appears on page 1 of this tutorial.",
      filename: "Week2_Fasciola_hepatica_TUTORIAL.pdf",
      source_role: "tutorial",
    });
    expect(paste.status).toBe(201);

    const listPack = await app.request(
      `/api/atlas/${atlasId}/entries`,
      { headers: focusAuthHeaders() },
      env,
    );
    expect(listPack.status).toBe(200);
    const withPack = (await listPack.json()) as { entries: AtlasEntryView[] };
    expect(
      withPack.entries.find((e) => e.id === "fasciola-hepatica"),
    ).toMatchObject({
      tier: "key",
      reason: expect.stringMatching(/tutorial/i),
    });
  });
});
